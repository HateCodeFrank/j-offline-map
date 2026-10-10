# JOfflineMap

基于 Vue 3、Leaflet 和 PMTiles 的离线地图组件，支持同一地图展示多条路线、地图点击画线和路线 Marker 动画。

组件不内置路线操作按钮，业务侧可自行实现 UI，并通过组件实例方法控制绘制、完成、撤销和清除。

## 安装

```bash
npm install j-offline-map leaflet
```

在入口文件中引入组件样式：

```ts
import "j-offline-map/style.css";
```

## 基本使用

```vue
<script setup lang="ts">
import { ref } from "vue";
import { JOfflineMap } from "j-offline-map";
import type {
  JOfflineMapExpose,
  MapBounds,
  MapPoint,
} from "j-offline-map";

// 地图组件实例
const mapRef = ref<JOfflineMapExpose | null>(null);

// 离线地图显示范围
const chinaBounds: MapBounds = {
  southWest: { lat: 18, lng: 73.5 },
  northEast: { lat: 53.6, lng: 135.1 },
};

// 外部路线坐标
const routePoints: MapPoint[] = [
  { lat: 30.990442, lng: 103.958232 },
  { lat: 30.868903, lng: 103.997363 },
  { lat: 30.657037, lng: 104.066802 },
];

// 当前选点，传入后会在地图上反显
const selectedPoint = ref<MapPoint>({
  lat: 30.814392,
  lng: 104.017103,
});

// 接收点击地图选择的经纬度
const handlePointSelect = (point: MapPoint) => {
  selectedPoint.value = point;
};

// 接收手工绘制结果
const handleDrawFinish = (points: MapPoint[]) => {
  console.log(points);
};
</script>

<template>
  <JOfflineMap
    ref="mapRef"
    tile-url="http://127.0.0.1:33312/china-z11.pmtiles"
    :bounds="chinaBounds"
    :max-data-zoom="11"
    :route-points="routePoints"
    :start-point="routePoints[0]"
    :selected-point="selectedPoint"
    point-selection-enabled
    last-segment-dashed
    height="600px"
    @draw-finish="handleDrawFinish"
    @point-select="handlePointSelect"
  />
</template>
```

`tileUrl` 必须是支持 HTTP Range 请求的 PMTiles 地址；跨域部署时需要配置 CORS。

## 多路线展示

通过 `routes` 传入路线列表，每条路线独立绘制，路线之间不会连线。坐标或样式变化后自动更新，地图自动适配所有路线的范围。

```vue
<script setup lang="ts">
import { ref } from "vue";
import { JOfflineMap } from "j-offline-map";
import type { MapRoute } from "j-offline-map";

// 同一地图上的多条路线
const routes = ref<MapRoute[]>([
  {
    workPackageName: "彭州到成都运输工作包",
    points: [
      { lat: 30.990442, lng: 103.958232 },
      { lat: 30.868903, lng: 103.997363 },
      { lat: 30.657037, lng: 104.066802 },
    ],
    startPoint: { lat: 30.990442, lng: 103.958232 },
    style: { color: "#1677ff", weight: 4 },
    lastSegmentDashed: false,
  },
  {
    workPackageName: "成都到青白江运输工作包",
    points: [
      { lat: 30.664, lng: 104.072 },
      { lat: 30.755, lng: 104.18 },
      { lat: 30.83, lng: 104.24 },
    ],
    style: { color: "#f97316", weight: 5 },
    lastSegmentDashed: true,
  },
]);
</script>

<template>
  <JOfflineMap
    tile-url="http://127.0.0.1:33312/china-z11.pmtiles"
    :routes="routes"
    height="600px"
  />
</template>
```

`MapRoute` 的 `points` 为路线坐标，`workPackageName` 为该路线对应的工作包名称（可不传），`style` 覆盖公共 `routeStyle`，`lastSegmentDashed` 覆盖公共末段虚线设置，`startPoint` 可为该路线单独展示起点。无效经纬度会被忽略，少于两个有效坐标不绘制线段。

`routes` 与原有 `routePoints` 可以同时展示。手绘、撤销和 `clearRoute()` 操作当前单条路线；`drawRoutes(routes)` 替换多路线列表，`clearRoutes()` 清除该列表、对应起点和车辆。使用绑定时，应同步更新外部 `routes`，清空可设置为 `[]`。手绘多条路线时，在 `drawFinish` 中将结果和工作包名称一起追加到 `routes`，再调用 `clearRoute()` 清除当前草稿。

调用 `playRouteAnimation()` 后，每条有效路线显示一辆独立运行的车，车上名称取自该路线的 `workPackageName`；不传名称时只显示车辆。`pauseRouteAnimation()`、`playRouteAnimation()` 和 `stopRouteAnimation()` 分别暂停、继续和停止所有车辆。名称或样式变化保留进度；播放中修改坐标或新增路线，对应车辆按当前时长和循环设置从起点播放。少于两个有效点或总距离为零的路线不播放车辆动画。

使用 `routes` 绑定并立即播放时，先 `await nextTick()` 等待组件接收数据；使用 `drawRoutes(routes)` 方法可在下一行直接调用播放。

## Props

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tileUrl` | `string` | 必填 | PMTiles 文件地址，需要支持 HTTP Range 请求 |
| `routePoints` | `MapPoint[]` | `[]` | 外部传入的路线坐标，变化后自动重新绘制 |
| `routes` | `MapRoute[]` | `[]` | 多路线列表，每条包含坐标、可选工作包名称、样式、末段虚线和起点 |
| `startPoint` | `MapPoint` | - | 可选的路线起始点，传入后显示固定的起点 Marker |
| `selectedPoint` | `MapPoint` | - | 当前选点，传入后显示选点 Marker 并移动到可视区域 |
| `pointSelectionEnabled` | `boolean` | `false` | 是否允许点击地图选择单个坐标 |
| `lastSegmentDashed` | `boolean` | `false` | 是否将路线最后两个坐标之间的一段显示为虚线 |
| `bounds` | `MapBounds` | - | 地图显示范围，同时作为地图拖动限制范围 |
| `center` | `MapPoint` | 成都坐标 | 未传入 `bounds` 时使用的初始中心点 |
| `zoom` | `number` | `7` | 未传入 `bounds` 时使用的初始缩放级别 |
| `minZoom` | `number` | `3` | 允许用户缩小到的最小级别 |
| `maxZoom` | `number` | `18` | 允许用户放大到的最大级别 |
| `maxDataZoom` | `number` | `15` | PMTiles 文件实际包含数据的最大缩放级别 |
| `lang` | `string` | `zh-Hans` | 地图标签语言 |
| `flavor` | `MapFlavor` | `light` | Protomaps 底图主题 |
| `width` | `string \| number` | `100%` | 组件宽度，数字按像素处理 |
| `height` | `string \| number` | `100%` | 组件高度，数字按像素处理 |
| `restrictBounds` | `boolean` | `true` | 是否限制地图只能在 `bounds` 附近拖动，仅在传入 `bounds` 时生效 |
| `fitRouteOnChange` | `boolean` | `true` | 路线变化后是否自动缩放到完整路线范围 |
| `routeStyle` | `RouteStyleOptions` | `{}` | 路线颜色、宽度和透明度配置 |
| `routeMarkerImage` | `string` | 内置货车图片 | 路线动画 Marker 图片，支持 URL、静态资源路径或 `import` 后的图片地址 |
| `workPackageName` | `string` | `""` | 仅用于原有单路线车辆的可选名称；多路线名称在各条 `MapRoute` 中传入 |

## Events

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `pointSelect` | `MapPoint` | 开启单点选择后，点击地图时返回所选经纬度 |
| `update:selectedPoint` | `MapPoint` | 支持使用 `v-model:selected-point` 双向绑定当前选点 |
| `routeChange` | `MapPoint[]` | 手工绘制、撤销或清空路线时返回当前路线点 |
| `drawFinish` | `MapPoint[]` | 完成手工路线绘制时返回路线点 |

## 外部控制

```ts
// 绘制路线
mapRef.value?.drawRoute(routePoints);

// 批量绘制多条路线，替换多路线列表
mapRef.value?.drawRoutes(routes.value);

// 清除多路线列表及对应起点
mapRef.value?.clearRoutes();

// 开始手工画线
mapRef.value?.startDrawing();

// 完成并获取路线
const points = mapRef.value?.finishDrawing();

// 缩放到所有路线
mapRef.value?.fitRoute();

// 播放所有路线车辆，每条路线使用自己的工作包名称
mapRef.value?.playRouteAnimation({
  duration: 10000,
  loop: true,
});

// 暂停并继续路线动画
mapRef.value?.pauseRouteAnimation();
mapRef.value?.playRouteAnimation();

// 停止所有动画并移除车辆
mapRef.value?.stopRouteAnimation();

// 清除路线
mapRef.value?.clearRoute();
```

路线动画覆盖 `routes` 列表及 `routePoints`、`drawRoute()` 或手绘得到的当前路线，各辆车从各自路线的第一个点开始，按照各段实际距离匀速运行。路线坐标越密集，Marker 轨迹越贴近真实道路。原有单路线调用方式保持兼容，无需传入工作包名称。

组件会监听自身容器尺寸变化，并在 Tab 切换、弹窗展开、布局调整或窗口缩放后刷新地图尺寸；`fitRouteOnChange` 为 `true` 时会重新缩放到完整路线。

工作包名称由业务侧在各条路线中传入，显示在对应车辆上方并保持水平。传空字符串或不传时隐藏该车辆的名称。

自定义路线 Marker 图片：

```vue
<script setup lang="ts">
import customTruck from "./assets/custom-truck.png";
</script>

<template>
  <JOfflineMap :route-marker-image="customTruck" />
</template>
```

组件统一使用 `{ lat, lng }`，即纬度在前、经度在后。若转换为 GeoJSON，GeoJSON 坐标顺序为 `[经度, 纬度]`。

## 发布

```bash
npm login
npm run build
npm run pack:check
npm publish
```
