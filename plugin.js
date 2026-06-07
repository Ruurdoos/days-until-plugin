(function () {
  const EMBED_TITLE = 'Days Until';

  function hasMethod(name) {
    return typeof PluginAPI[name] === 'function';
  }

  function openCountdownView() {
    if (hasMethod('showIndexHtmlAsView')) {
      PluginAPI.showIndexHtmlAsView();
    }
  }

  function registerUi() {
    if (hasMethod('registerSidePanelButton')) {
      PluginAPI.registerSidePanelButton({
        label: EMBED_TITLE,
        icon: 'event_upcoming',
        onClick: openCountdownView,
      });
    }

    if (hasMethod('registerMenuEntry')) {
      PluginAPI.registerMenuEntry({
        label: EMBED_TITLE,
        icon: 'event_upcoming',
        onClick: openCountdownView,
      });
    }

    if (!hasMethod('registerSidePanelButton') && hasMethod('registerHeaderButton')) {
      PluginAPI.registerHeaderButton({
        label: EMBED_TITLE,
        icon: 'event_upcoming',
        onClick: openCountdownView,
      });
    }
  }

  if (typeof PluginAPI.onReady === 'function') {
    PluginAPI.onReady(registerUi);
    return;
  }

  registerUi();
})();
