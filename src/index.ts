import type { App, Plugin } from "vue";
import JOfflineMap from "./components/JOfflineMap.vue";

// 注册全局地图组件
const JOfflineMapPlugin: Plugin = {
  install(app: App) {
    app.component("JOfflineMap", JOfflineMap);
  },
};

export { JOfflineMap };
export * from "./types";
export default JOfflineMapPlugin;
