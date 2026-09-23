# JOfflineMap

基于 Vue 3、Leaflet 和 PMTiles 的离线地图组件，支持外部路线加载、地图点击画线和路线 Marker 动画。

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
    height="600px"
    @draw-finish="handleDrawFinish"
  />
</template>
```

`tileUrl` 必须是支持 HTTP Range 请求的 PMTiles 地址；跨域部署时需要配置 CORS。

## Props

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tileUrl` | `string` | 必填 | PMTiles 文件地址，需要支持 HTTP Range 请求 |
| `routePoints` | `MapPoint[]` | `[]` | 外部传入的路线坐标，变化后自动重新绘制 |
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

## 外部控制

```ts
// 绘制路线
mapRef.value?.drawRoute(routePoints);

// 开始手工画线
mapRef.value?.startDrawing();

// 完成并获取路线
const points = mapRef.value?.finishDrawing();

// 缩放到路线
mapRef.value?.fitRoute();

// 播放循环路线动画
mapRef.value?.playRouteAnimation({
  duration: 10000,
  loop: true,
});

// 暂停并继续路线动画
mapRef.value?.pauseRouteAnimation();
mapRef.value?.playRouteAnimation();

// 停止动画并移除箭头
mapRef.value?.stopRouteAnimation();

// 清除路线
mapRef.value?.clearRoute();
```

路线动画会从传入路线的第一个点开始，按照各段实际距离匀速运行。路线坐标越密集，Marker 轨迹越贴近真实道路。

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
