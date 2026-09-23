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
  RouteAnimationOptions,
  RouteStyleOptions,
} from "../types";

interface RouteAnimationSegment {
  from: L.LatLng;
  to: L.LatLng;
  startDistance: number;
  length: number;
  bearing: number;
}

// 组件输入参数
const props = withDefaults(
  defineProps<{
    /** PMTiles 文件地址，需要支持 HTTP Range 请求 */
    tileUrl: string;
    /** 外部传入的路线坐标，变化后会自动重新绘制 */
    routePoints?: readonly MapPoint[];
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
    /** 路线动画 Marker 图片，支持外部 URL 或 import 后的图片地址 */
    routeMarkerImage?: string;
  }>(),
  {
    routePoints: () => [],
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
    routeMarkerImage: defaultRouteMarkerImage,
  },
);

// 组件输出事件
const emit = defineEmits<{
  drawFinish: [points: MapPoint[]];
  routeChange: [points: MapPoint[]];
}>();

// 地图容器和图层实例
const mapContainerRef = ref<HTMLDivElement | null>(null);
const isDrawing = ref(false);
let map: LeafletMap | null = null;
let baseLayer: ReturnType<typeof leafletLayer> | null = null;
let routeLine: L.Polyline | null = null;
const currentRoutePoints: L.LatLng[] = [];

// 路线动画运行状态
const DEFAULT_ROUTE_ANIMATION_DURATION = 12000;
let routeAnimationMarker: L.Marker | null = null;
let routeAnimationFrameId: number | null = null;
let routeAnimationStartedAt = 0;
let routeAnimationElapsed = 0;
let routeAnimationDuration = DEFAULT_ROUTE_ANIMATION_DURATION;
let routeAnimationLoop = true;
let routeAnimationSegments: RouteAnimationSegment[] = [];
let routeAnimationTotalDistance = 0;

// 合并路线显示样式
const currentRouteStyle = computed<L.PolylineOptions>(() => ({
  color: "#1677ff",
  weight: 4,
  opacity: 0.9,
  ...props.routeStyle,
}));

// 计算组件容器尺寸
const rootStyle = computed<CSSProperties>(() => ({
  width: typeof props.width === "number" ? `${props.width}px` : props.width,
  height: typeof props.height === "number" ? `${props.height}px` : props.height,
}));

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
const createRouteAnimationSegments = () => {
  let totalDistance = 0;
  routeAnimationSegments = currentRoutePoints.slice(0, -1).map((from, index) => {
    const to = currentRoutePoints[index + 1];
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
  routeAnimationTotalDistance = totalDistance;
};

// 创建沿路线移动的 Marker 图标
const createRouteAnimationIcon = () => {
  const markerElement = document.createElement("span");
  markerElement.className = "j-offline-map__route-marker";

  const markerImage = document.createElement("img");
  markerImage.src = props.routeMarkerImage;
  markerImage.alt = "";
  markerImage.draggable = false;
  markerElement.appendChild(markerImage);

  return L.divIcon({
    className: "j-offline-map__route-marker-icon",
    html: markerElement,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
};

// 更新 Marker 位置和朝向
const updateRouteAnimationPosition = (progress: number) => {
  if (!routeAnimationMarker || !routeAnimationSegments.length) {
    return;
  }

  const targetDistance = routeAnimationTotalDistance * progress;
  const segment =
    routeAnimationSegments.find(
      (item) => targetDistance <= item.startDistance + item.length,
    ) || routeAnimationSegments[routeAnimationSegments.length - 1];
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

  routeAnimationMarker.setLatLng(nextPosition);
  const markerElement = routeAnimationMarker
    .getElement()
    ?.querySelector<HTMLElement>(".j-offline-map__route-marker");
  if (markerElement) {
    markerElement.style.transform = `rotate(${segment.bearing}deg)`;
  }
};

// 执行路线动画的下一帧
const renderRouteAnimationFrame = (timestamp: number) => {
  const elapsed =
    routeAnimationElapsed + Math.max(timestamp - routeAnimationStartedAt, 0);
  const rawProgress = elapsed / routeAnimationDuration;
  const progress = routeAnimationLoop
    ? rawProgress % 1
    : Math.min(rawProgress, 1);
  updateRouteAnimationPosition(progress);

  if (!routeAnimationLoop && rawProgress >= 1) {
    routeAnimationFrameId = null;
    routeAnimationStartedAt = 0;
    routeAnimationElapsed = routeAnimationDuration;
    return;
  }

  routeAnimationFrameId = window.requestAnimationFrame(
    renderRouteAnimationFrame,
  );
};

// 暂停当前路线动画
const pauseRouteAnimation = () => {
  if (routeAnimationFrameId === null) {
    return;
  }

  const currentElapsed =
    routeAnimationElapsed +
    Math.max(window.performance.now() - routeAnimationStartedAt, 0);
  routeAnimationElapsed = routeAnimationLoop
    ? currentElapsed % routeAnimationDuration
    : Math.min(currentElapsed, routeAnimationDuration);
  window.cancelAnimationFrame(routeAnimationFrameId);
  routeAnimationFrameId = null;
  routeAnimationStartedAt = 0;
};

// 停止路线动画并移除箭头
const stopRouteAnimation = () => {
  if (routeAnimationFrameId !== null) {
    window.cancelAnimationFrame(routeAnimationFrameId);
  }

  if (map && routeAnimationMarker) {
    map.removeLayer(routeAnimationMarker);
  }

  routeAnimationMarker = null;
  routeAnimationFrameId = null;
  routeAnimationStartedAt = 0;
  routeAnimationElapsed = 0;
  routeAnimationDuration = DEFAULT_ROUTE_ANIMATION_DURATION;
  routeAnimationLoop = true;
  routeAnimationSegments = [];
  routeAnimationTotalDistance = 0;
};

// 播放或继续播放当前路线动画
const playRouteAnimation = (options: RouteAnimationOptions = {}) => {
  if (!map || currentRoutePoints.length < 2 || routeAnimationFrameId !== null) {
    return;
  }

  if (options.duration !== undefined) {
    routeAnimationDuration = Math.max(options.duration, 100);
  }
  if (options.loop !== undefined) {
    routeAnimationLoop = options.loop;
  }

  if (!routeAnimationSegments.length) {
    createRouteAnimationSegments();
  }
  if (!routeAnimationTotalDistance) {
    return;
  }

  if (routeAnimationElapsed >= routeAnimationDuration) {
    routeAnimationElapsed = 0;
  }
  if (!routeAnimationMarker) {
    routeAnimationMarker = L.marker(currentRoutePoints[0], {
      icon: createRouteAnimationIcon(),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);
  }

  updateRouteAnimationPosition(routeAnimationElapsed / routeAnimationDuration);
  routeAnimationStartedAt = window.performance.now();
  routeAnimationFrameId = window.requestAnimationFrame(
    renderRouteAnimationFrame,
  );
};

// 停止地图点击绘制
const stopDrawing = () => {
  isDrawing.value = false;
  map?.off("click", handleMapClick);
};

// 移除当前路线图层和坐标
const removeCurrentRoute = () => {
  stopRouteAnimation();
  currentRoutePoints.length = 0;

  if (map && routeLine) {
    map.removeLayer(routeLine);
  }

  routeLine = null;
};

// 缩放到当前路线范围
const fitRoute = () => {
  if (!map || !routeLine || currentRoutePoints.length === 0) {
    return;
  }

  map.fitBounds(routeLine.getBounds(), { padding: [48, 48] });
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
    ...points.map(({ lat, lng }) => L.latLng(lat, lng)),
  );
  routeLine = L.polyline(currentRoutePoints, currentRouteStyle.value).addTo(map);

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

  if (!routeLine) {
    routeLine = L.polyline(
      currentRoutePoints,
      currentRouteStyle.value,
    ).addTo(map);
  } else {
    routeLine.setLatLngs(currentRoutePoints);
  }

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
  if (!routeLine || currentRoutePoints.length === 0) {
    return;
  }

  stopRouteAnimation();
  currentRoutePoints.pop();
  routeLine.setLatLngs(currentRoutePoints);
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

  loadBaseLayer();

  if (props.routePoints.length > 0) {
    drawRoute(props.routePoints);
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

// 监听底图配置变化并重新加载
watch(
  () => [props.tileUrl, props.flavor, props.lang, props.maxDataZoom] as const,
  () => {
    loadBaseLayer();
  },
);

// 监听路线样式变化并更新图层
watch(
  currentRouteStyle,
  (style) => {
    routeLine?.setStyle(style);
  },
  { deep: true },
);

// 监听外部 Marker 图片变化并更新动画图标
watch(
  () => props.routeMarkerImage,
  () => {
    if (!routeAnimationMarker) {
      return;
    }
    routeAnimationMarker.setIcon(createRouteAnimationIcon());
  },
);

// 页面挂载后创建地图
onMounted(() => {
  initMap();
});

// 页面卸载时清理地图实例
onBeforeUnmount(() => {
  stopRouteAnimation();
  stopDrawing();
  map?.remove();
  map = null;
  baseLayer = null;
  routeLine = null;
});

// 暴露外部地图控制方法
defineExpose<JOfflineMapExpose>({
  drawRoute,
  clearRoute,
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
