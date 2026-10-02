import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Player } from "@remotion/player";
import { Captions, DEFAULT_PROPS } from "./Captions.jsx";
import { TPL, TEMPLATES, TEMPLATE_DEFAULTS, TRANSITIONS, wordCss, lineCss } from "./templates.js";
import { FONT_NAMES, fontFamily } from "./fonts.js";

// In the browser preview there is no delayRender budget, so warm every font up
// front — switching the Font dropdown then updates the preview instantly.
try { FONT_NAMES.forEach((n) => fontFamily(n)); } catch (e) {}

let root = null;
let currentProps = { ...DEFAULT_PROPS };
let setPlayerState = null;
let globalPlayerRef = null;

function calcFrames(p) {
  const dur = p?.durationInSeconds || 20;
  const fps = p?.fps || 30;
  return Math.max(2, Math.round(dur * fps));
}

function StudioPlayer({ initialProps }) {
  const [props, setProps] = useState(initialProps);
  const playerRef = useRef(null);
  globalPlayerRef = playerRef;
  setPlayerState = setProps;

  useEffect(() => {
    // When props update (e.g. color, accent, template), trigger redraw if player is paused
    if (playerRef.current && !playerRef.current.isPlaying()) {
      try {
        const cur = playerRef.current.getCurrentFrame();
        playerRef.current.seekTo(cur);
      } catch (e) {}
    }
  }, [props]);

  return (
    <Player
      ref={playerRef}
      component={Captions}
      inputProps={props}
      durationInFrames={calcFrames(props)}
      fps={props.fps || 30}
      compositionWidth={props.width || 1080}
      compositionHeight={props.height || 1920}
      style={{ width: "100%", height: "100%" }}
      controls={true}
      loop={true}
      acknowledgeRemotionLicense={true}
    />
  );
}

window.CS = {
  FONTS: FONT_NAMES,
  TEMPLATES,
  TEMPLATE_DEFAULTS,
  TRANSITIONS,
  TPL,
  fontFamily,
  // the gallery cards render through the exact same style functions as the video
  wordCss, lineCss,
  mount(el, initial) {
    if (root) {
      try { root.unmount(); } catch (e) {}
      root = null;
    }
    root = createRoot(el);
    currentProps = {
      ...DEFAULT_PROPS,
      ...initial,
      style: { ...DEFAULT_PROPS.style, ...((initial || {}).style || {}) },
    };
    root.render(React.createElement(StudioPlayer, { initialProps: currentProps }));
  },
  update(patch) {
    currentProps = {
      ...currentProps,
      ...patch,
      style: { ...currentProps.style, ...((patch || {}).style || {}) },
    };
    if (setPlayerState) {
      setPlayerState({ ...currentProps });
    }
  },
  seekTo(frame) {
    if (globalPlayerRef && globalPlayerRef.current) {
      try { globalPlayerRef.current.seekTo(frame); } catch (e) {}
    }
  },
  player() {
    return globalPlayerRef ? globalPlayerRef.current : null;
  },
  props() { return currentProps; },
};
