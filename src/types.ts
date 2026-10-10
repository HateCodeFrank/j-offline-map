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

// 同一地图上的独立路线配置
export interface MapRoute {
  points: readonly MapPoint[];
  /** 该路线车辆上显示的工作包名称，不传则隐藏 */
  workPackageName?: string;
  style?: RouteStyleOptions;
  lastSegmentDashed?: boolean;
  startPoint?: MapPoint;
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
  drawRoutes: (routes: readonly MapRoute[]) => void;
  clearRoutes: () => void;
  startDrawing: () => void;
  finishDrawing: () => MapPoint[];
  undoLastPoint: () => void;
  fitRoute: () => void;
  playRouteAnimation: (options?: RouteAnimationOptions) => void;
  pauseRouteAnimation: () => void;
  stopRouteAnimation: () => void;
}
