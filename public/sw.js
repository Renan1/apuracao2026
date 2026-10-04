// Service worker mínimo: habilita instalar o site na tela inicial e exibir notificações no celular.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // sempre vai à rede (dados ao vivo)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => (l[0] ? l[0].focus() : self.clients.openWindow("/")))
  );
});
