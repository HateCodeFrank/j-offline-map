<script setup lang="ts">
import { nextTick, ref } from "vue";
import JOfflineMap from "./components/JOfflineMap.vue";
import type {
  JOfflineMapExpose,
  MapBounds,
  MapPoint,
  MapRoute,
} from "./types";

// 地图组件实例
const offlineMapRef = ref<JOfflineMapExpose | null>(null);

// 中国地图显示范围
const chinaBounds: MapBounds = {
  southWest: { lat: 18, lng: 73.5 },
  northEast: { lat: 53.6, lng: 135.1 },
};

// 彭州城区路线起点，用于展示固定的起点 Marker
const routeStartPoint: MapPoint = {
  lat: 30.990442,
  lng: 103.958232,
};

// 当前选点，初始值用于演示外部坐标反显
const selectedPoint = ref<MapPoint>({
  lat: 30.814392,
  lng: 104.017103,
});

// 彭州城区到成都天府广场示例路线
const pengzhouToChengduRoute: MapPoint[] = [
  routeStartPoint,
  { lat: 30.990221, lng: 103.961688 },
  { lat: 30.975256, lng: 103.962194 },
  { lat: 30.951238, lng: 103.954609 },
  { lat: 30.942993, lng: 103.958069 },
  { lat: 30.917063, lng: 103.977726 },
  { lat: 30.895127, lng: 103.982076 },
  { lat: 30.868903, lng: 103.997363 },
  { lat: 30.814392, lng: 104.017103 },
  { lat: 30.787444, lng: 104.046498 },
  { lat: 30.773687, lng: 104.051316 },
  { lat: 30.766723, lng: 104.04809 },
  { lat: 30.753688, lng: 104.047884 },
  { lat: 30.747569, lng: 104.04282 },
  { lat: 30.736861, lng: 104.042153 },
  { lat: 30.723926, lng: 104.047578 },
  { lat: 30.72134, lng: 104.053824 },
  { lat: 30.707958, lng: 104.063228 },
  { lat: 30.686847, lng: 104.063563 },
  { lat: 30.678535, lng: 104.0578 },
  { lat: 30.673294, lng: 104.068312 },
  { lat: 30.657037, lng: 104.066802 },
];

// 多路线示例，分别展示颜色、独立起点和末段虚线
const exampleRoutes: MapRoute[] = [
  {
    points: pengzhouToChengduRoute,
    workPackageName: "彭州到成都运输工作包",
    startPoint: routeStartPoint,
    style: { color: "#1677ff" },
    lastSegmentDashed: false,
  },
  {
    workPackageName: "成都到青白江运输工作包",
    points: [
      { lat: 30.664, lng: 104.072 },
      { lat: 30.705, lng: 104.13 },
      { lat: 30.755, lng: 104.18 },
      { lat: 30.83, lng: 104.24 },
    ],
    startPoint: { lat: 30.664, lng: 104.072 },
    style: { color: "#f97316", weight: 5 },
    lastSegmentDashed: true,
  },
];
const routes = ref<MapRoute[]>([...exampleRoutes]);

// 加载多条示例路线
const loadExampleRoutes = () => {
  offlineMapRef.value?.clearRoute();
  routes.value = [...exampleRoutes];
};

// 加载示例路线
const loadExampleRoute = () => {
  routes.value = [];
  offlineMapRef.value?.clearRoutes();
  offlineMapRef.value?.drawRoute(pengzhouToChengduRoute);
};

// 加载无名称的单路线并播放车辆动画
const playExampleRoute = () => {
  loadExampleRoute();
  offlineMapRef.value?.playRouteAnimation({ duration: 10000, loop: true });
};

// 等待多路线绑定更新后播放各工作包车辆动画
const playExampleRoutes = async () => {
  loadExampleRoutes();
  await nextTick();
  offlineMapRef.value?.playRouteAnimation({ duration: 10000, loop: true });
};

// 将完成的手绘路线追加到多路线列表
const handleDrawFinish = (points: MapPoint[]) => {
  if (points.length < 2) {
    return;
  }
  routes.value = [
    ...routes.value,
    {
      points,
      workPackageName: `手绘工作包${routes.value.length + 1}`,
      startPoint: points[0],
      style: { color: "#16a34a" },
      lastSegmentDashed: false,
    },
  ];
  offlineMapRef.value?.clearRoute();
};

// 清除当前路线及多路线列表
const clearAllRoutes = () => {
  routes.value = [];
  offlineMapRef.value?.clearRoute();
  offlineMapRef.value?.clearRoutes();
};

// 接收地图点击选择的经纬度
const handlePointSelect = (point: MapPoint) => {
  selectedPoint.value = point;
};
</script>

<template>
  <main class="demo-page">
    <div class="demo-toolbar" @click.stop @pointerdown.stop>
      <button type="button" @click="loadExampleRoutes">加载多条路线</button>
      <button type="button" @click="loadExampleRoute">加载彭州到成都示例</button>
      <button type="button" @click="playExampleRoutes">播放多工作包车辆</button>
      <button type="button" @click="playExampleRoute">播放无名称单路径</button>
      <button type="button" @click="offlineMapRef?.pauseRouteAnimation()">
        暂停动画
      </button>
      <button type="button" @click="offlineMapRef?.playRouteAnimation()">
        继续动画
      </button>
      <button type="button" @click="offlineMapRef?.stopRouteAnimation()">
        停止动画
      </button>
      <button type="button" @click="offlineMapRef?.startDrawing()">
        开始画线
      </button>
      <button type="button" @click="offlineMapRef?.finishDrawing()">
        完成并追加
      </button>
      <button type="button" @click="offlineMapRef?.undoLastPoint()">
        撤销一点
      </button>
      <button type="button" @click="clearAllRoutes">清除全部</button>
      <span class="selected-point-text">路线：{{ routes.length }} 条</span>
      <span class="selected-point-text">
        选点：{{ selectedPoint.lng.toFixed(6) }},
        {{ selectedPoint.lat.toFixed(6) }}
      </span>
    </div>

    <JOfflineMap
      ref="offlineMapRef"
      tile-url="http://127.0.0.1:33312/china-z11.pmtiles"
      :bounds="chinaBounds"
      :max-data-zoom="11"
      :routes="routes"
      :start-point="routeStartPoint"
      :selected-point="selectedPoint"
      point-selection-enabled
      last-segment-dashed
      height="100vh"
      @draw-finish="handleDrawFinish"
      @point-select="handlePointSelect"
    />
  </main>
</template>

<style scoped>
.demo-page {
  position: relative;
  width: 100%;
  height: 100vh;
}

.demo-toolbar {
  position: absolute;
  top: 16px;
  left: 56px;
  right: 16px;
  z-index: 1100;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
}

.demo-toolbar button {
  padding: 6px 12px;
  color: #1f2329;
  cursor: pointer;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.demo-toolbar button:hover {
  color: #1677ff;
  border-color: #1677ff;
}

.selected-point-text {
  align-self: center;
  white-space: nowrap;
}
</style>
