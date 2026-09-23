<script setup lang="ts">
import { ref } from "vue";
import JOfflineMap from "./components/JOfflineMap.vue";
import type {
  JOfflineMapExpose,
  MapBounds,
  MapPoint,
} from "./types";

// 地图组件实例
const offlineMapRef = ref<JOfflineMapExpose | null>(null);

// 中国地图显示范围
const chinaBounds: MapBounds = {
  southWest: { lat: 18, lng: 73.5 },
  northEast: { lat: 53.6, lng: 135.1 },
};

// 彭州城区到成都天府广场示例路线
const pengzhouToChengduRoute: MapPoint[] = [
  { lat: 30.990442, lng: 103.958232 },
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

// 加载示例路线
const loadExampleRoute = () => {
  offlineMapRef.value?.drawRoute(pengzhouToChengduRoute);
};

// 加载路线并播放循环箭头动画
const playExampleRoute = () => {
  offlineMapRef.value?.drawRoute(pengzhouToChengduRoute);
  offlineMapRef.value?.playRouteAnimation({ duration: 10000, loop: true });
};

// 输出手工绘制完成的路线
const handleDrawFinish = (points: MapPoint[]) => {
  console.log("绘制完成：", points);
};
</script>

<template>
  <main class="demo-page">
    <div class="demo-toolbar" @click.stop @pointerdown.stop>
      <button type="button" @click="loadExampleRoute">加载彭州到成都示例</button>
      <button type="button" @click="playExampleRoute">播放路线动画</button>
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
        完成
      </button>
      <button type="button" @click="offlineMapRef?.undoLastPoint()">
        撤销一点
      </button>
      <button type="button" @click="offlineMapRef?.clearRoute()">清除</button>
    </div>

    <JOfflineMap
      ref="offlineMapRef"
      tile-url="http://127.0.0.1:33312/china-z11.pmtiles"
      :bounds="chinaBounds"
      :max-data-zoom="11"
      height="100vh"
      @draw-finish="handleDrawFinish"
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
  z-index: 1100;
  display: flex;
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
</style>
