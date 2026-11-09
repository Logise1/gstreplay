# GSTREPLAY

A static replay of Google Santa Tracker.

GSTREPLAY runs the original Santa Tracker map as if **today were 24 December**, while keeping the **real current time**. Santa’s flight plays back in real time against that Christmas Eve clock.

This is a stripped-down copy of the tracker only: no village, no games, and no Node server. It is plain HTML, CSS, and JavaScript.

LIVE on [https://logise1.github.io/gstreplay/](https://logise1.github.io/gstreplay/)

The map uses OpenStreetMap tiles. The original Google Maps API key only works on Google’s domains, so it cannot run on GitHub Pages.

## How the replay works

The tracker still uses its original `Date.now() + trackerOffset` path. On load, `trackerOffset` is set so that “now” is 24 December of the current year, at the same hour, minute, and second as your clock. The route timestamps are skewed to that same Christmas Eve, so Santa moves along the original flight as time passes.

## License

Tracker code and assets come from [Google Santa Tracker](https://github.com/google/santa-tracker-web). Image and audio files are CC-BY. Other files are Apache-2.0. See `LICENSE`.
