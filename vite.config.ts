import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// 配置组件库和演示页面构建
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  publicDir: mode === "demo" ? "public" : false,
  build:
    mode === "demo"
      ? undefined
      : {
          lib: {
            entry: "src/index.ts",
            name: "JOfflineMap",
            formats: ["es", "umd"],
            fileName: (format) =>
              format === "es"
                ? "j-offline-map.js"
                : "j-offline-map.umd.cjs",
            cssFileName: "style",
          },
          rollupOptions: {
            external: ["vue", "leaflet", "protomaps-leaflet"],
            output: {
              exports: "named",
              globals: {
                vue: "Vue",
                leaflet: "L",
                "protomaps-leaflet": "protomapsL",
              },
            },
          },
        },
}));
