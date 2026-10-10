<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import L, { type Map as LeafletMap } from "leaflet";
import { leafletLayer } from "protomaps-leaflet";
import defaultRouteMarkerImage from "../assets/delivery-truck.png";
import type {
  JOfflineMapExpose,
  MapBounds,
  MapFlavor,
  MapPoint,
  MapRoute,
  RouteAnimationOptions,
  RouteStyleOptions,
} from "../types";

// 路线动画分段信息
interface RouteAnimationSegment {
  from: L.LatLng;
  to: L.LatLng;
  startDistance: number;
  length: number;
  bearing: number;
}

// 每条路线独立保存车辆和播放进度
interface RouteAnimationState {
  points: L.LatLng[];
  workPackageName: string;
  marker: L.Marker | null;
  frameId: number | null;
  startedAt: number;
  elapsed: number;
  duration: number;
  loop: boolean;
  segments: RouteAnimationSegment[];
  totalDistance: number;
}

// 组件输入参数
const props = withDefaults(
  defineProps<{
    /** PMTiles 文件地址，需要支持 HTTP Range 请求 */
    tileUrl: string;
    /** 外部传入的路线坐标，变化后会自动重新绘制 */
    routePoints?: readonly MapPoint[];
    /** 同一地图上展示的多条路线，可分别配置样式和起点 */
    routes?: readonly MapRoute[];
    /** 可选的路线起始点，传入后显示固定起点 Marker */
    startPoint?: MapPoint;
    /** 外部传入的当前选点，传入后显示选点 Marker */
    selectedPoint?: MapPoint;
    /** 是否允许点击地图选择单个坐标 */
    pointSelectionEnabled?: boolean;
    /** 地图显示范围，同时作为 restrictBounds 的限制范围 */
    bounds?: MapBounds;
    /** 未传入 bounds 时使用的初始中心点 */
    center?: MapPoint;
    /** 未传入 bounds 时使用的初始缩放级别 */
    zoom?: number;
    /** 允许用户缩小到的最小级别 */
    minZoom?: number;
    /** 允许用户放大到的最大级别 */
    maxZoom?: number;
    /** PMTiles 文件实际包含数据的最大缩放级别 */
    maxDataZoom?: number;
    /** 地图标签语言，例如 zh-Hans */
    lang?: string;
    /** Protomaps 底图主题 */
    flavor?: MapFlavor;
    /** 组件宽度，数字按像素处理，也可传入 CSS 尺寸字符串 */
    width?: string | number;
    /** 组件高度，数字按像素处理，也可传入 CSS 尺寸字符串 */
    height?: string | number;
    /** 是否限制地图只能在 bounds 附近拖动，仅在传入 bounds 时生效 */
    restrictBounds?: boolean;
    /** 路线变化后是否自动缩放到完整路线范围 */
    fitRouteOnChange?: boolean;
    /** 路线颜色、宽度和透明度配置 */
    routeStyle?: RouteStyleOptions;
    /** 是否将路线最后一段显示为虚线 */
    lastSegmentDashed?: boolean;
    /** 路线动画 Marker 图片，支持外部 URL 或 import 后的图片地址 */
    routeMarkerImage?: string;
    /** 单路线车辆动画图标上方的可选名称，多路线使用各自的名称 */
    workPackageName?: string;
  }>(),
  {
    routePoints: () => [],
    routes: () => [],
    startPoint: undefined,
    selectedPoint: undefined,
    pointSelectionEnabled: false,
    bounds: undefined,
    center: () => ({ lat: 30.657, lng: 104.0668 }),
    zoom: 7,
    minZoom: 5,
    maxZoom: 18,
    maxDataZoom: 15,
    lang: "zh-Hans",
    flavor: "light",
    width: "100%",
    height: "100%",
    restrictBounds: true,
    fitRouteOnChange: true,
    routeStyle: () => ({}),
    lastSegmentDashed: false,
    routeMarkerImage: defaultRouteMarkerImage,
    workPackageName: "",
  },
);

// 组件输出事件
const emit = defineEmits<{
  drawFinish: [points: MapPoint[]];
  routeChange: [points: MapPoint[]];
  pointSelect: [point: MapPoint];
  "update:selectedPoint": [point: MapPoint];
}>();

// 地图容器和图层实例
const mapContainerRef = ref<HTMLDivElement | null>(null);
const isDrawing = ref(false);
let map: LeafletMap | null = null;
let baseLayer: ReturnType<typeof leafletLayer> | null = null;
let routeLine: L.Polyline | null = null;
let lastSegmentLine: L.Polyline | null = null;
let startPointMarker: L.Marker | null = null;
let selectedPointMarker: L.Marker | null = null;
let mapResizeObserver: ResizeObserver | null = null;
let mapResizeFrameId: number | null = null;
const currentRoutePoints: L.LatLng[] = [];

// 多路线图层与坐标，独立于当前手绘路线
let routesLayer: L.LayerGroup | null = null;
let currentRoutes: MapRoute[] = [];

// 创建独立的路线动画状态
const DEFAULT_ROUTE_ANIMATION_DURATION = 12000;
const createRouteAnimationState = (
  points: L.LatLng[],
  workPackageName = "",
): RouteAnimationState => ({
  points,
  workPackageName,
  marker: null,
  frameId: null,
  startedAt: 0,
  elapsed: 0,
  duration: DEFAULT_ROUTE_ANIMATION_DURATION,
  loop: true,
  segments: [],
  totalDistance: 0,
});

// 单路线与多路线分别管理动画，统一对外控制
const singleRouteAnimation = createRouteAnimationState(currentRoutePoints);
let routesAnimations: RouteAnimationState[] = [];

// 合并路线显示样式
const currentRouteStyle = computed<L.PolylineOptions>(() => ({
  color: "#1677ff",
  weight: 4,
  opacity: 0.9,
  ...props.routeStyle,
}));

// 合并路线最后一段的虚线样式
const currentLastSegmentStyle = computed<L.PolylineOptions>(() => ({
  ...currentRouteStyle.value,
  dashArray: "10 8",
}));

// 计算组件容器尺寸
const rootStyle = computed<CSSProperties>(() => ({
  width: typeof props.width === "number" ? `${props.width}px` : props.width,
  height: typeof props.height === "number" ? `${props.height}px` : props.height,
}));

// 判断外部传入的坐标是否可用于地图展示
const isValidMapPoint = (point?: MapPoint): point is MapPoint =>
  Boolean(
    point &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      point.lat >= -90 &&
      point.lat <= 90 &&
      point.lng >= -180 &&
      point.lng <= 180,
  );

// 将组件边界转换为 Leaflet 边界
const getLeafletBounds = (bounds: MapBounds) =>
  L.latLngBounds(
    [bounds.southWest.lat, bounds.southWest.lng],
    [bounds.northEast.lat, bounds.northEast.lng],
  );

// 获取当前路线坐标副本
const getRoutePoints = (): MapPoint[] =>
  currentRoutePoints.map(({ lat, lng }) => ({ lat, lng }));

// 计算路线分段的前进方向
const getBearing = (from: L.LatLng, to: L.LatLng) => {
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const lngDiff = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(lngDiff) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(lngDiff);

  return (Math.atan2(y, x) * 180) / Math.PI;
};

// 创建路线动画分段数据
const createRouteAnimationSegments = (animation: RouteAnimationState) => {
  let totalDistance = 0;
  animation.segments = animation.points.slice(0, -1).map((from, index) => {
    const to = animation.points[index + 1];
    const length = from.distanceTo(to);
    const segment = {
      from,
      to,
      startDistance: totalDistance,
      length,
      bearing: getBearing(from, to),
    };
    totalDistance += length;
    return segment;
  });
  animation.totalDistance = totalDistance;
};

// 创建沿路线移动的 Marker 图标
const createRouteAnimationIcon = (workPackageName: string) => {
  const markerContainer = document.createElement("span");
  markerContainer.className = "j-offline-map__route-marker-content";
  const markerElement = document.createElement("span");
  markerElement.className = "j-offline-map__route-marker";

  const markerImage = document.createElement("img");
  markerImage.src = props.routeMarkerImage;
  markerImage.alt = "";
  markerImage.draggable = false;
  markerElement.appendChild(markerImage);
  markerContainer.appendChild(markerElement);

  // 工作包名称独立于车辆旋转，按纯文本展示
  const markerLabel = document.createElement("span");
  markerLabel.className = "j-offline-map__route-marker-label";
  markerLabel.textContent = workPackageName.trim();
  markerLabel.title = workPackageName.trim();
  markerContainer.appendChild(markerLabel);

  return L.divIcon({
    className: "j-offline-map__route-marker-icon",
    html: markerContainer,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
};

// 创建固定起点 Marker 图标
const createStartPointIcon = () =>
  L.divIcon({
    className: "j-offline-map__start-marker-icon",
    html: '<span class="j-offline-map__start-marker"><span>起</span></span>',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });

// 根据 startPoint 更新固定起点 Marker
const renderStartPointMarker = () => {
  if (!map) {
    return;
  }

  if (startPointMarker) {
    map.removeLayer(startPointMarker);
    startPointMarker = null;
  }
  if (!isValidMapPoint(props.startPoint)) {
    return;
  }

  startPointMarker = L.marker([props.startPoint.lat, props.startPoint.lng], {
    icon: createStartPointIcon(),
    interactive: false,
    keyboard: false,
    zIndexOffset: 900,
  }).addTo(map);
};

// 创建当前选点 Marker 图标
const createSelectedPointIcon = () =>
  L.divIcon({
    className: "j-offline-map__selected-marker-icon",
    html: '<span class="j-offline-map__selected-marker"><span></span></span>',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  });

// 根据外部值或点击结果更新选点 Marker
const renderSelectedPointMarker = (
  point: MapPoint | undefined = props.selectedPoint,
  focus = false,
) => {
  if (!map) {
    return;
  }

  if (selectedPointMarker) {
    map.removeLayer(selectedPointMarker);
    selectedPointMarker = null;
  }
  if (!isValidMapPoint(point)) {
    return;
  }

  const latLng = L.latLng(point.lat, point.lng);
  selectedPointMarker = L.marker(latLng, {
    icon: createSelectedPointIcon(),
    interactive: false,
    keyboard: false,
    zIndexOffset: 950,
  }).addTo(map);
  if (focus) {
    map.panTo(latLng);
  }
};

// 点击地图时选择单个坐标并向外通知
function handlePointSelectClick(event: L.LeafletMouseEvent) {
  if (isDrawing.value || !props.pointSelectionEnabled) {
    return;
  }

  const point: MapPoint = {
    lat: event.latlng.lat,
    lng: event.latlng.lng,
  };
  renderSelectedPointMarker(point);
  emit("pointSelect", point);
  emit("update:selectedPoint", point);
}

// 更新指定路线车辆的位置和朝向
const updateRouteAnimationPosition = (
  animation: RouteAnimationState,
  progress: number,
) => {
  if (!animation.marker || !animation.segments.length) {
    return;
  }

  const targetDistance = animation.totalDistance * progress;
  const segment =
    animation.segments.find(
      (item) => targetDistance <= item.startDistance + item.length,
    ) || animation.segments[animation.segments.length - 1];
  const segmentProgress = segment.length
    ? Math.min(
        Math.max((targetDistance - segment.startDistance) / segment.length, 0),
        1,
      )
    : 0;
  const nextPosition = L.latLng(
    segment.from.lat + (segment.to.lat - segment.from.lat) * segmentProgress,
    segment.from.lng + (segment.to.lng - segment.from.lng) * segmentProgress,
  );

  animation.marker.setLatLng(nextPosition);
  const markerElement = animation.marker
    .getElement()
    ?.querySelector<HTMLElement>(".j-offline-map__route-marker");
  if (markerElement) {
    markerElement.style.transform = `rotate(${segment.bearing}deg)`;
  }
};

// 获取指定路线当前播放进度
const getRouteAnimationElapsed = (
  animation: RouteAnimationState,
  timestamp = window.performance.now(),
) => {
  const elapsed =
    animation.elapsed +
    (animation.frameId === null
      ? 0
      : Math.max(timestamp - animation.startedAt, 0));
  return animation.loop
    ? elapsed % animation.duration
    : Math.min(elapsed, animation.duration);
};

// 执行指定路线动画的下一帧
const renderRouteAnimationFrame = (
  animation: RouteAnimationState,
  timestamp: number,
) => {
  const elapsed =
    animation.elapsed + Math.max(timestamp - animation.startedAt, 0);
  const rawProgress = elapsed / animation.duration;
  const progress = animation.loop ? rawProgress % 1 : Math.min(rawProgress, 1);
  updateRouteAnimationPosition(animation, progress);

  if (!animation.loop && rawProgress >= 1) {
    animation.frameId = null;
    animation.startedAt = 0;
    animation.elapsed = animation.duration;
    return;
  }

  animation.frameId = window.requestAnimationFrame((nextTimestamp) => {
    renderRouteAnimationFrame(animation, nextTimestamp);
  });
};

// 暂停指定路线动画并保存独立进度
const pauseAnimation = (animation: RouteAnimationState) => {
  if (animation.frameId === null) {
    return;
  }

  animation.elapsed = getRouteAnimationElapsed(animation);
  window.cancelAnimationFrame(animation.frameId);
  animation.frameId = null;
  animation.startedAt = 0;
  updateRouteAnimationPosition(animation, animation.elapsed / animation.duration);
};

// 停止指定路线动画并清理车辆和进度
const stopAnimation = (animation: RouteAnimationState) => {
  if (animation.frameId !== null) {
    window.cancelAnimationFrame(animation.frameId);
  }
  animation.marker?.remove();
  animation.marker = null;
  animation.frameId = null;
  animation.startedAt = 0;
  animation.elapsed = 0;
  animation.duration = DEFAULT_ROUTE_ANIMATION_DURATION;
  animation.loop = true;
  animation.segments = [];
  animation.totalDistance = 0;
};

// 播放或继续指定路线动画
const playAnimation = (
  animation: RouteAnimationState,
  options: RouteAnimationOptions = {},
) => {
  if (!map || animation.points.length < 2 || animation.frameId !== null) {
    return;
  }

  if (options.duration !== undefined && Number.isFinite(options.duration)) {
    animation.duration = Math.max(options.duration, 100);
  }
  if (options.loop !== undefined) {
    animation.loop = options.loop;
  }
  if (!animation.segments.length) {
    createRouteAnimationSegments(animation);
  }
  if (!animation.totalDistance) {
    return;
  }
  if (animation.elapsed >= animation.duration) {
    animation.elapsed = 0;
  }
  if (!animation.marker) {
    animation.marker = L.marker(animation.points[0], {
      icon: createRouteAnimationIcon(animation.workPackageName),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);
  }

  updateRouteAnimationPosition(animation, animation.elapsed / animation.duration);
  animation.startedAt = window.performance.now();
  animation.frameId = window.requestAnimationFrame((timestamp) => {
    renderRouteAnimationFrame(animation, timestamp);
  });
};

// 暂停地图上所有路线的车辆动画
const pauseRouteAnimation = () => {
  [singleRouteAnimation, ...routesAnimations].forEach(pauseAnimation);
};

// 停止所有路线动画并移除车辆
const stopRouteAnimation = () => {
  [singleRouteAnimation, ...routesAnimations].forEach(stopAnimation);
};

// 播放所有路线动画，每条有效路线对应一个车辆
const playRouteAnimation = (options: RouteAnimationOptions = {}) => {
  singleRouteAnimation.workPackageName = props.workPackageName;
  [singleRouteAnimation, ...routesAnimations].forEach((animation) => {
    playAnimation(animation, options);
  });
};

// 更新指定路线的工作包标签，保留车辆位置和播放进度
const updateAnimationLabel = (animation: RouteAnimationState, name: string) => {
  animation.workPackageName = name;
  const label = animation.marker
    ?.getElement()
    ?.querySelector<HTMLElement>(".j-offline-map__route-marker-label");
  if (label) {
    label.textContent = name.trim();
    label.title = name.trim();
  }
};

// 停止地图点击绘制
const stopDrawing = () => {
  isDrawing.value = false;
  map?.off("click", handleMapClick);
};

// 根据路线点重绘实线部分和最后一段虚线
const renderRouteLines = () => {
  if (!map) {
    return;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  if (lastSegmentLine) {
    map.removeLayer(lastSegmentLine);
    lastSegmentLine = null;
  }
  if (currentRoutePoints.length < 2) {
    return;
  }

  if (!props.lastSegmentDashed) {
    routeLine = L.polyline(
      currentRoutePoints,
      currentRouteStyle.value,
    ).addTo(map);
    return;
  }

  const solidPoints = currentRoutePoints.slice(0, -1);
  if (solidPoints.length >= 2) {
    routeLine = L.polyline(solidPoints, currentRouteStyle.value).addTo(map);
  }
  lastSegmentLine = L.polyline(
    currentRoutePoints.slice(-2),
    currentLastSegmentStyle.value,
  ).addTo(map);
};

// 重绘多条独立路线，分别应用样式和起点配置
const renderRoutes = () => {
  if (!map) {
    return;
  }

  if (!routesLayer) {
    routesLayer = L.layerGroup().addTo(map);
  }
  const layer = routesLayer;
  layer.clearLayers();

  currentRoutes.forEach((route) => {
    const points = route.points.map(({ lat, lng }) => L.latLng(lat, lng));
    const style: L.PolylineOptions = {
      ...currentRouteStyle.value,
      ...route.style,
    };
    if (points.length >= 2) {
      if (route.lastSegmentDashed ?? props.lastSegmentDashed) {
        const solidPoints = points.slice(0, -1);
        if (solidPoints.length >= 2) {
          L.polyline(solidPoints, style).addTo(layer);
        }
        L.polyline(points.slice(-2), { ...style, dashArray: "10 8" }).addTo(
          layer,
        );
      } else {
        L.polyline(points, style).addTo(layer);
      }
    }
    if (isValidMapPoint(route.startPoint)) {
      L.marker([route.startPoint.lat, route.startPoint.lng], {
        icon: createStartPointIcon(),
        interactive: false,
        keyboard: false,
        zIndexOffset: 900,
      }).addTo(layer);
    }
  });
};

// 清除批量展示的路线和对应起点
const clearRoutes = () => {
  routesAnimations.forEach(stopAnimation);
  routesAnimations = [];
  routesLayer?.clearLayers();
  currentRoutes = [];
};

// 移除当前路线图层和坐标
const removeCurrentRoute = () => {
  stopAnimation(singleRouteAnimation);
  currentRoutePoints.length = 0;

  if (map && routeLine) {
    map.removeLayer(routeLine);
  }
  if (map && lastSegmentLine) {
    map.removeLayer(lastSegmentLine);
  }

  routeLine = null;
  lastSegmentLine = null;
};

// 获取所有路线及起点的展示坐标
const getDisplayPoints = (): L.LatLng[] => {
  const points = [...currentRoutePoints];
  currentRoutes.forEach((route) => {
    points.push(...route.points.map(({ lat, lng }) => L.latLng(lat, lng)));
    if (isValidMapPoint(route.startPoint)) {
      points.push(L.latLng(route.startPoint.lat, route.startPoint.lng));
    }
  });
  if (isValidMapPoint(props.startPoint)) {
    points.push(L.latLng(props.startPoint.lat, props.startPoint.lng));
  }
  return points;
};

// 缩放到所有路线和起点的范围
const fitRoute = () => {
  if (!map) {
    return;
  }

  const displayPoints = getDisplayPoints();
  if (!displayPoints.length) {
    return;
  }

  map.fitBounds(L.latLngBounds(displayPoints), { padding: [48, 48] });
};

// 在容器尺寸稳定后刷新 Leaflet 并重新适配当前内容
const refreshMapViewport = () => {
  if (!map || !mapContainerRef.value) {
    return;
  }
  if (
    mapContainerRef.value.clientWidth <= 0 ||
    mapContainerRef.value.clientHeight <= 0
  ) {
    return;
  }

  map.invalidateSize({ animate: false, pan: false });
  if (
    currentRoutePoints.length > 0 ||
    currentRoutes.some(
      (route) => route.points.length > 0 || isValidMapPoint(route.startPoint),
    )
  ) {
    if (props.fitRouteOnChange) {
      fitRoute();
    }
    return;
  }
  if (isValidMapPoint(props.selectedPoint)) {
    map.panTo([props.selectedPoint.lat, props.selectedPoint.lng]);
    return;
  }
  if (props.bounds) {
    map.fitBounds(getLeafletBounds(props.bounds));
  }
};

// 合并同一帧内多次容器尺寸变化
const scheduleMapResize = () => {
  if (mapResizeFrameId !== null) {
    window.cancelAnimationFrame(mapResizeFrameId);
  }
  mapResizeFrameId = window.requestAnimationFrame(() => {
    mapResizeFrameId = null;
    refreshMapViewport();
  });
};

// 停止监听地图容器尺寸
const stopMapResizeObserver = () => {
  mapResizeObserver?.disconnect();
  mapResizeObserver = null;
  window.removeEventListener("resize", scheduleMapResize);
  if (mapResizeFrameId !== null) {
    window.cancelAnimationFrame(mapResizeFrameId);
    mapResizeFrameId = null;
  }
};

// 监听 Tab、弹窗和布局变化后的地图实际尺寸
const startMapResizeObserver = () => {
  stopMapResizeObserver();
  if (!mapContainerRef.value) {
    return;
  }
  if (typeof ResizeObserver !== "undefined") {
    mapResizeObserver = new ResizeObserver(scheduleMapResize);
    mapResizeObserver.observe(mapContainerRef.value);
  } else {
    window.addEventListener("resize", scheduleMapResize);
  }
  scheduleMapResize();
};

// 绘制外部传入路线
const drawRoute = (points: readonly MapPoint[]) => {
  if (!map) {
    return;
  }

  stopDrawing();
  removeCurrentRoute();

  if (points.length === 0) {
    return;
  }

  currentRoutePoints.push(
    ...points.filter(isValidMapPoint).map(({ lat, lng }) => L.latLng(lat, lng)),
  );
  renderRouteLines();

  if (props.fitRouteOnChange) {
    fitRoute();
  }
};

// 批量替换路线及关联车辆，坐标未变时保留动画进度
const drawRoutes = (routes: readonly MapRoute[]) => {
  const runningAnimation = routesAnimations.find(
    (animation) => animation.frameId !== null,
  );
  const playbackOptions = runningAnimation
    ? { duration: runningAnimation.duration, loop: runningAnimation.loop }
    : undefined;
  const previousAnimations = routesAnimations;
  currentRoutes = routes.map((route) => ({
    points: route.points
      .filter(isValidMapPoint)
      .map(({ lat, lng }) => ({ lat, lng })),
    workPackageName: route.workPackageName ?? "",
    style: route.style ? { ...route.style } : undefined,
    lastSegmentDashed: route.lastSegmentDashed,
    startPoint: isValidMapPoint(route.startPoint)
      ? { ...route.startPoint }
      : undefined,
  }));
  routesAnimations = currentRoutes.map((route, index) => {
    const previous = previousAnimations[index];
    if (
      previous &&
      previous.points.length === route.points.length &&
      previous.points.every((point, pointIndex) => {
        const next = route.points[pointIndex];
        return point.lat === next.lat && point.lng === next.lng;
      })
    ) {
      updateAnimationLabel(previous, route.workPackageName ?? "");
      return previous;
    }
    if (previous) {
      stopAnimation(previous);
    }
    return createRouteAnimationState(
      route.points.map(({ lat, lng }) => L.latLng(lat, lng)),
      route.workPackageName,
    );
  });
  previousAnimations.slice(currentRoutes.length).forEach(stopAnimation);
  renderRoutes();
  if (playbackOptions) {
    routesAnimations.forEach((animation) => {
      playAnimation(animation, playbackOptions);
    });
  }
  if (props.fitRouteOnChange) {
    fitRoute();
  }
};

// 处理地图点击并添加路线节点
function handleMapClick(event: L.LeafletMouseEvent) {
  if (!isDrawing.value || !map) {
    return;
  }

  currentRoutePoints.push(event.latlng);
  renderRouteLines();

  emit("routeChange", getRoutePoints());
}

// 开始绘制一条新路线
const startDrawing = () => {
  if (!map) {
    return;
  }

  map.off("click", handleMapClick);
  removeCurrentRoute();
  isDrawing.value = true;
  emit("routeChange", []);
  map.on("click", handleMapClick);
};

// 完成当前路线绘制
const finishDrawing = (): MapPoint[] => {
  stopDrawing();
  const points = getRoutePoints();
  emit("drawFinish", points);
  return points;
};

// 撤销最后一个路线节点
const undoLastPoint = () => {
  if (currentRoutePoints.length === 0) {
    return;
  }

  stopAnimation(singleRouteAnimation);
  currentRoutePoints.pop();
  renderRouteLines();
  emit("routeChange", getRoutePoints());
};

// 清除当前路线
const clearRoute = () => {
  stopDrawing();
  removeCurrentRoute();
  emit("routeChange", []);
};

// 加载或切换 PMTiles 底图
const loadBaseLayer = () => {
  if (!map || !props.tileUrl) {
    return;
  }

  if (baseLayer) {
    baseLayer.remove();
  }

  const nextBaseLayer = leafletLayer({
    url: props.tileUrl,
    flavor: props.flavor,
    lang: props.lang,
    maxDataZoom: props.maxDataZoom,
  });
  nextBaseLayer.addTo(map);
  baseLayer = nextBaseLayer;
};

// 初始化离线地图
const initMap = () => {
  if (!mapContainerRef.value) {
    return;
  }

  const initialBounds = props.bounds
    ? getLeafletBounds(props.bounds)
    : undefined;

  map = L.map(mapContainerRef.value, {
    minZoom: props.minZoom,
    maxZoom: props.maxZoom,
    attributionControl: false,
    maxBounds:
      initialBounds && props.restrictBounds
        ? initialBounds.pad(0.1)
        : undefined,
    maxBoundsViscosity: props.restrictBounds ? 1 : 0,
  });

  if (initialBounds) {
    map.fitBounds(initialBounds);
  } else {
    map.setView([props.center.lat, props.center.lng], props.zoom);
  }

  map.on("click", handlePointSelectClick);
  loadBaseLayer();
  renderStartPointMarker();
  renderSelectedPointMarker(props.selectedPoint, true);

  if (props.routePoints.length > 0) {
    drawRoute(props.routePoints);
  }
  if (props.routes.length > 0) {
    drawRoutes(props.routes);
  }
};

// 监听外部路线变化并重新绘制
watch(
  () => props.routePoints,
  (points) => {
    if (map) {
      drawRoute(points);
    }
  },
  { deep: true },
);

// 监听多路线坐标和独立配置变化并重新绘制
watch(
  () => props.routes,
  (routes) => {
    drawRoutes(routes);
  },
  { deep: true },
);

// 监听外部起始点变化并更新固定 Marker
watch(
  () => props.startPoint,
  () => {
    renderStartPointMarker();
    if (props.fitRouteOnChange) {
      fitRoute();
    }
  },
  { deep: true },
);

// 监听外部选点变化并反显 Marker
watch(
  () => props.selectedPoint,
  (point) => {
    renderSelectedPointMarker(point, true);
  },
  { deep: true },
);

// 监听底图配置变化并重新加载
watch(
  () => [props.tileUrl, props.flavor, props.lang, props.maxDataZoom] as const,
  () => {
    loadBaseLayer();
  },
);

// 监听路线样式和末段模式变化并重绘图层
watch(
  [currentRouteStyle, currentLastSegmentStyle, () => props.lastSegmentDashed],
  () => {
    renderRouteLines();
    renderRoutes();
  },
  { deep: true },
);

// 监听公共车辆图片变化并刷新所有图标，保留当前位置和朝向
watch(
  () => props.routeMarkerImage,
  () => {
    [singleRouteAnimation, ...routesAnimations].forEach((animation) => {
      if (!animation.marker) {
        return;
      }
      animation.marker.setIcon(
        createRouteAnimationIcon(animation.workPackageName),
      );
      updateRouteAnimationPosition(
        animation,
        getRouteAnimationElapsed(animation) / animation.duration,
      );
    });
  },
);

// 监听单路线可选名称变化，多路线名称由各条路线配置
watch(
  () => props.workPackageName,
  (name) => {
    updateAnimationLabel(singleRouteAnimation, name);
  },
);

// 页面挂载后创建地图
onMounted(() => {
  initMap();
  startMapResizeObserver();
});

// 页面卸载时清理地图实例
onBeforeUnmount(() => {
  stopMapResizeObserver();
  stopRouteAnimation();
  stopDrawing();
  clearRoutes();
  map?.remove();
  map = null;
  baseLayer = null;
  routeLine = null;
  lastSegmentLine = null;
  routesLayer = null;
  startPointMarker = null;
  selectedPointMarker = null;
});

// 暴露外部地图控制方法
defineExpose<JOfflineMapExpose>({
  drawRoute,
  clearRoute,
  drawRoutes,
  clearRoutes,
  startDrawing,
  finishDrawing,
  undoLastPoint,
  fitRoute,
  playRouteAnimation,
  pauseRouteAnimation,
  stopRouteAnimation,
});
</script>

<template>
  <div class="j-offline-map" :style="rootStyle">
    <div ref="mapContainerRef" class="j-offline-map__canvas"></div>
  </div>
</template>

<style>
@import "leaflet/dist/leaflet.css";

.j-offline-map__route-marker-icon {
  background: transparent;
  border: 0;
}

.j-offline-map__route-marker-content {
  position: relative;
  display: block;
  width: 56px;
  height: 56px;
}

.j-offline-map__route-marker-label {
  position: absolute;
  bottom: calc(100% - 12px);
  left: 50%;
  width: max-content;
  max-width: 240px;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 20%);
  color: #1f2329;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  overflow-wrap: anywhere;
  pointer-events: none;
  transform: translateX(-50%);
}

.j-offline-map__route-marker-label:empty {
  display: none;
}

.j-offline-map__route-marker {
  display: block;
  width: 56px;
  height: 56px;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 35%));
  transform-origin: center;
  will-change: transform;
}

.j-offline-map__route-marker img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

.j-offline-map__start-marker-icon {
  background: transparent;
  border: 0;
}

.j-offline-map__start-marker {
  box-sizing: border-box;
  display: grid;
  width: 32px;
  height: 32px;
  border: 3px solid #fff;
  border-radius: 50% 50% 50% 0;
  background: #16a34a;
  box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  place-items: center;
  transform: rotate(-45deg);
}

.j-offline-map__start-marker > span {
  display: block;
  transform: rotate(45deg);
}

.j-offline-map__selected-marker-icon {
  background: transparent;
  border: 0;
}

.j-offline-map__selected-marker {
  box-sizing: border-box;
  display: grid;
  width: 32px;
  height: 32px;
  border: 3px solid #fff;
  border-radius: 50% 50% 50% 0;
  background: #1677ff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  place-items: center;
  transform: rotate(-45deg);
}

.j-offline-map__selected-marker > span {
  display: block;
  transform: rotate(45deg);
}
</style>

<style scoped>
.j-offline-map {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.j-offline-map__canvas {
  width: 100%;
  height: 100%;
}
</style>
