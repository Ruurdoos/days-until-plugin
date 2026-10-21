// The side panel button is added automatically by the host because manifest.json sets
// "sidePanel": true, so only a menu entry for the full-page view is registered here.
PluginAPI.registerMenuEntry({
  label: 'Days Until',
  icon: 'event_upcoming',
  onClick: () => {
    PluginAPI.showIndexHtmlAsView();
  },
});
