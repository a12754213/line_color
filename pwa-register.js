if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((error) => {
            console.warn("Service Worker 註冊失敗：", error);
        });
    });
}
