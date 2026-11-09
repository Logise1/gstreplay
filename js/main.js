import '../src/polyfill/css.js';
import {christmasEveOffset} from '../src/lib/time.js';
import {fetchRoute} from '../scenes/modvil/elements/maputils.js';
import '../scenes/modvil/elements/modvil-tracker.js';

window.gtag = window.gtag || function() {};

const tracker = document.querySelector('modvil-tracker');
tracker.trackerOffset = christmasEveOffset();
tracker.routeJitter = 10;

const routeUrl =
    'https://firebasestorage.googleapis.com/v0/b/santa-tracker-firebase.appspot.com/o/route%2Fsanta_|LANG|.json?alt=media&2018b';

fetchRoute(routeUrl).then((destinations) => {
  tracker.destinations = destinations || [];
}).catch((err) => {
  console.error('failed to load Santa route', err);
});
