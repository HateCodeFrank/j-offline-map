// 地图经纬度坐标
export interface MapPoint {
  lat: number;
  lng: number;
}

// 地图显示边界
export interface MapBounds {
  southWest: MapPoint;
  northEast: MapPoint;
}

// 路线显示样式
export interface RouteStyleOptions {
  color?: string;
  weight?: number;
  opacity?: number;
}

// 离线底图主题
export type MapFlavor = "light" | "dark" | "white" | "grayscale" | "black";

// 路线动画配置
export interface RouteAnimationOptions {
  /** Marker 从起点运行到终点的时长，单位毫秒 */
  duration?: number;
  /** 到达终点后是否从起点继续循环 */
  loop?: boolean;
}

// 地图组件对外方法
export interface JOfflineMapExpose {
  drawRoute: (points: readonly MapPoint[]) => void;
  clearRoute: () => void;
  startDrawing: () => void;
  finishDrawing: () => MapPoint[];
  undoLastPoint: () => void;
  fitRoute: () => void;
  playRouteAnimation: (options?: RouteAnimationOptions) => void;
  pauseRouteAnimation: () => void;
  stopRouteAnimation: () => void;
}
