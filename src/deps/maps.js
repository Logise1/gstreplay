/**
 * Loads a map implementation and exposes a google.maps-compatible API so the
 * original Santa Tracker overlay, markers, and polylines keep working.
 *
 * GitHub Pages cannot use the original Santa Tracker Maps key
 * (ReferrerNotAllowedMapError), so this uses Leaflet + CARTO tiles instead.
 */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadCss(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

const TRACKER_LAYOUT_CSS = `
:host {
  display: block !important;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  padding-bottom: 0 !important;
}
.outer {
  position: absolute !important;
  inset: 0;
  width: 100%;
  height: 100%;
}
.map,
.leaflet-container {
  position: absolute !important;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  background: #8ee0dd;
}
#top-divider {
  display: none !important;
}
.outer .overflow,
.outer .info {
  z-index: 1000;
}
.outer .info > * {
  z-index: 1 !important;
}
.top,
.buttons {
  z-index: 1001;
}
.leaflet-container img.leaflet-tile {
  mix-blend-mode: normal !important;
  max-width: none !important;
  max-height: none !important;
}
.leaflet-tile {
  outline: 1px solid transparent;
  border: none !important;
}
`;

let leafletStyleSheet = null;

function attachLeafletStyles(el) {
  const root = el.getRootNode();
  if (!(root instanceof ShadowRoot) || !leafletStyleSheet) {
    return;
  }
  if (!root.adoptedStyleSheets.includes(leafletStyleSheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, leafletStyleSheet];
  }
}

function toLatLngLiteral(pos) {
  if (!pos) {
    return null;
  }
  if (typeof pos.lat === 'function') {
    return {lat: pos.lat(), lng: pos.lng()};
  }
  return {lat: +pos.lat, lng: +pos.lng};
}

function toLeafletLatLng(pos) {
  const lit = toLatLngLiteral(pos);
  return lit ? window.L.latLng(lit.lat, lit.lng) : null;
}

function installGoogleMapsShim(L) {
  class LatLng {
    constructor(lat, lng) {
      if (lat && typeof lat === 'object' && lng === undefined) {
        lng = lat.lng;
        lat = lat.lat;
      }
      this._lat = +lat;
      this._lng = +lng;
    }
    lat() {
      return this._lat;
    }
    lng() {
      return this._lng;
    }
  }

  class LatLngBounds {
    constructor(sw, ne) {
      const a = toLeafletLatLng(sw);
      const b = toLeafletLatLng(ne || sw);
      this._bounds = L.latLngBounds(a, b);
    }
  }

  class Size {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  }

  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }

  const listeners = new WeakMap();

  function addNamedListener(target, name, fn) {
    const record = {target, name, fn};
    const list = listeners.get(target) || [];
    list.push(record);
    listeners.set(target, list);
    return record;
  }

  class Map {
    constructor(el, opts = {}) {
      this._el = el;
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.background = opts.backgroundColor || '#8ee0dd';
      attachLeafletStyles(el);

      this._pendingCenter = null;
      this._pendingZoom = null;
      this._suppressEvents = false;

      this._map = L.map(el, {
        center: toLeafletLatLng(opts.center) || [84.6, 168],
        zoom: opts.zoom == null ? 2 : opts.zoom,
        minZoom: opts.minZoom == null ? 2 : opts.minZoom,
        maxZoom: 12,
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: true,
        worldCopyJump: true,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
        zoomSnap: 1,
        zoomDelta: 1,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        detectRetina: false,
      }).addTo(this._map);

      this._zoomControl = L.control.zoom({position: 'bottomright'});
      if (opts.zoomControl !== false) {
        this._zoomControl.addTo(this._map);
      }

      if (!this._map.getPane('floatPane')) {
        this._map.createPane('floatPane');
        this._map.getPane('floatPane').style.zIndex = 650;
      }

      this._overlays = [];
      this.controls = {
        RIGHT_CENTER: {push() {}},
      };

      const redraw = () => this._overlays.forEach((overlay) => overlay.draw && overlay.draw());
      this._map.on('move zoom viewreset', redraw);
      this._map.on('move', () => {
        if (!this._suppressEvents) {
          this._emit('center_changed');
        }
      });
      this._map.on('zoom', () => {
        if (!this._suppressEvents) {
          this._emit('zoom_changed');
        }
      });
      this._map.whenReady(() => {
        this._map.invalidateSize();
        this._emit('tilesloaded');
      });

      const resize = () => this._map.invalidateSize();
      requestAnimationFrame(resize);
      setTimeout(resize, 100);
      setTimeout(resize, 500);
      window.addEventListener('resize', resize);
    }

    _emit(name) {
      (this._named || {})[name] && this._named[name].forEach((fn) => fn());
    }

    addListener(name, fn) {
      this._named = this._named || {};
      this._named[name] = this._named[name] || [];
      this._named[name].push(fn);
      return addNamedListener(this, name, fn);
    }

    setOptions(opts = {}) {
      if (opts.gestureHandling === 'none') {
        this._map.dragging.disable();
        this._map.scrollWheelZoom.disable();
        this._map.touchZoom.disable();
        this._map.doubleClickZoom.disable();
      } else if (opts.gestureHandling === 'auto') {
        this._map.dragging.enable();
        this._map.scrollWheelZoom.enable();
        this._map.touchZoom.enable();
        this._map.doubleClickZoom.enable();
      }
      if (opts.zoomControl === false) {
        this._map.removeControl(this._zoomControl);
      } else if (opts.zoomControl === true) {
        this._zoomControl.addTo(this._map);
      }
    }

    fitBounds(bounds) {
      const b = bounds && bounds._bounds;
      if (b) {
        this._pendingCenter = b.getCenter();
      }
    }

    setZoom(zoom) {
      this._pendingZoom = zoom;
    }

    panBy(x, y) {
      const zoom = this._pendingZoom != null ? this._pendingZoom : this._map.getZoom();
      const center = this._pendingCenter || this._map.getCenter();
      this._pendingZoom = null;
      this._pendingCenter = null;

      const point = this._map.project(center, zoom);
      const target = this._map.unproject(point.add([x, y]), zoom);
      const cur = this._map.getCenter();
      const sameZoom = this._map.getZoom() === zoom;
      const pixelShift = this._map.latLngToContainerPoint(cur)
          .distanceTo(this._map.latLngToContainerPoint(target));
      if (sameZoom && pixelShift < 1.5) {
        return;
      }

      this._suppressEvents = true;
      this._map.setView(target, zoom, {animate: false, reset: false});
      this._overlays.forEach((overlay) => overlay.draw && overlay.draw());
      this._suppressEvents = false;
    }
  }

  class OverlayView {
    constructor() {
      this._gmap = null;
    }

    setMap(gmap) {
      if (this._gmap === gmap) {
        return;
      }
      if (this._gmap) {
        const list = this._gmap._overlays;
        const i = list.indexOf(this);
        if (i >= 0) {
          list.splice(i, 1);
        }
        this.onRemove && this.onRemove();
      }
      this._gmap = gmap;
      if (gmap) {
        gmap._overlays.push(this);
        this.onAdd && this.onAdd();
        this.draw && this.draw();
      }
    }

    getPanes() {
      const pane = this._gmap._map.getPane('floatPane');
      return {
        floatPane: pane,
        overlayLayer: pane,
        overlayMouseTarget: pane,
        mapPane: pane,
      };
    }

    getProjection() {
      const map = this._gmap && this._gmap._map;
      if (!map) {
        return null;
      }
      return {
        fromLatLngToDivPixel(latLng) {
          const p = map.latLngToLayerPoint(toLeafletLatLng(latLng));
          return {x: p.x, y: p.y};
        },
      };
    }
  }

  class Marker {
    constructor(opts = {}) {
      this._opts = opts;
      const icon = opts.icon;
      let leafletIcon;
      if (icon && icon.url) {
        const size = icon.scaledSize || icon.size;
        const w = size ? size.width : 25;
        const h = size ? size.height : 41;
        const anchor = icon.anchor;
        leafletIcon = L.icon({
          iconUrl: icon.url,
          iconSize: [w, h],
          iconAnchor: anchor ? [anchor.x, anchor.y] : [w / 2, h],
        });
      }
      this._marker = L.marker(toLeafletLatLng(opts.position) || [0, 0], {
        icon: leafletIcon,
        title: opts.title || '',
        interactive: true,
      });
      this._gmap = null;
      if (opts.map) {
        this.setMap(opts.map);
      }
      if (opts.visible === false) {
        this.setVisible(false);
      }
    }

    addListener(name, fn) {
      this._marker.on(name, fn);
      return addNamedListener(this, name, fn);
    }

    setVisible(visible) {
      const map = this._gmap && this._gmap._map;
      if (!map) {
        return;
      }
      if (visible) {
        this._marker.addTo(map);
      } else {
        map.removeLayer(this._marker);
      }
    }

    setMap(gmap) {
      if (this._gmap && this._gmap._map) {
        this._gmap._map.removeLayer(this._marker);
      }
      this._gmap = gmap;
      if (gmap && gmap._map) {
        this._marker.addTo(gmap._map);
      }
    }
  }

  class Polyline {
    constructor(opts = {}) {
      this._line = L.polyline([], {
        color: opts.strokeColor || '#22a528',
        weight: opts.strokeWeight == null ? 2 : opts.strokeWeight,
        opacity: opts.strokeOpacity == null ? 1 : opts.strokeOpacity,
      });
      this._gmap = null;
      if (opts.map) {
        this.setMap(opts.map);
      }
    }

    setPath(points) {
      this._line.setLatLngs((points || []).map(toLeafletLatLng).filter(Boolean));
    }

    setMap(gmap) {
      if (this._gmap && this._gmap._map) {
        this._gmap._map.removeLayer(this._line);
      }
      this._gmap = gmap;
      if (gmap && gmap._map) {
        this._line.addTo(gmap._map);
      }
    }
  }

  const maps = {
    Map,
    OverlayView,
    Marker,
    Polyline,
    LatLng,
    LatLngBounds,
    Size,
    Point,
    ControlPosition: {RIGHT_CENTER: 'RIGHT_CENTER'},
    event: {
      removeListener(record) {
        if (!record) {
          return;
        }
        const list = listeners.get(record.target);
        if (list) {
          const i = list.indexOf(record);
          if (i >= 0) {
            list.splice(i, 1);
          }
        }
        if (record.target._named && record.target._named[record.name]) {
          record.target._named[record.name] =
              record.target._named[record.name].filter((fn) => fn !== record.fn);
        }
        if (record.target._marker) {
          record.target._marker.off(record.name, record.fn);
        }
      },
    },
  };

  window.google = window.google || {};
  window.google.maps = maps;
  return maps;
}

let mapsPromise = null;

export default function load() {
  if (mapsPromise === null) {
    mapsPromise = (async () => {
      const base = new URL('../../vendor/leaflet/', import.meta.url);
      const cssHref = new URL('leaflet.css', base).href;
      await loadCss(cssHref);
      const cssText = await fetch(cssHref).then((r) => r.text());
      leafletStyleSheet = new CSSStyleSheet();
      leafletStyleSheet.replaceSync(cssText + TRACKER_LAYOUT_CSS);
      if (!window.L) {
        await loadScript(new URL('leaflet.js', base).href);
      }
      return installGoogleMapsShim(window.L);
    })();
  }
  return mapsPromise;
}
