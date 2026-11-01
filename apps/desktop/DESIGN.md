---
name: moncripsy Desktop
description: A grunge-industrial local coding workbench with arcade HUD framing.
colors:
  ink: "#111111"
  ink-soft: "#343434"
  machine: "#1b1d1f"
  machine-raised: "#2b2e31"
  machine-line: "#55595d"
  paper: "#ffffff"
  paper-deep: "#272a2c"
  surface-raised: "#e8e7e1"
  hazard: "#f5c928"
  hazard-deep: "#c89800"
  hazard-wash: "#fff5cb"
  red: "#e32127"
  red-dark: "#b9161c"
  red-wash: "#fff0ef"
  quiet: "#575757"
  success: "#17653a"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "54px"
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: "0.005em"
  body:
    fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "IBM Plex Mono, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 600
rounded:
  none: "0px"
components:
  primary-action:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    height: "36px"
    padding: "0 14px"
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
---

## Overview

The desktop app is a local coding workbench framed like a battered arcade machine: graphite chassis, warning-yellow instrumentation, manga-print grit, and vermilion for real urgency. The HUD is graphic framing around actual app workflows, never a fictional game state.

## Colors

Graphite owns the app shell, navigation, and page canvas. Bright paper-white keeps forms, cards, transcript, and code readable. Hazard yellow marks navigation selection, industrial trim, and decorative panel IDs. Vermilion stays reserved for primary actions, recovery, errors, and permission requests. Success uses dark green only for successful health state.

## Typography

Anton provides condensed uppercase display voice for page and section headings. IBM Plex Sans carries readable interface and transcript copy. IBM Plex Mono is reserved for compact labels, paths, timestamps, and technical metadata. All fonts are bundled locally.

## Layout

Use the stable desktop side rail with a flexible content column. Keep page headings and primary actions distinct from supporting work areas. On narrow windows, move navigation above content and stack panels and controls in their existing reading order. Never require horizontal scrolling for a route.

## Elevation & Depth

Use layered graphite shell surfaces, crisp grid and halftone fields, and hard offset ink shadows on paper panels. Hazard stripe is a narrow structural edge, not a background for content. Keep reading and input surfaces free from texture.

## Shapes

Prefer square corners, visible black outlines, segmented bars, and measured tick marks. Use solid or dashed rules to distinguish controls, empty states, and technical activity. Keep focus rings high-contrast and offset from the control.

## Components

- The top bar is a compact machine fascia with a yellow instrument marker and neutral calibration ticks.
- Selected navigation uses high-contrast hazard yellow; red remains reserved for real actions and urgent states.
- Panel headers may carry concise decorative module IDs; these labels are not telemetry or user data.
- Primary buttons use a vermilion fill, white text, black outline, and offset black shadow.
- Inputs, transcript, code, and supporting cards keep clean white reading surfaces with square black outlines.
- Session, health, recovery, and permission states retain semantic text and distinct visual treatment; color never carries state alone.

## Do's and Don'ts

- Do use a dark graphite chassis with sparing hazard-yellow markers and controlled print texture.
- Do use decorative module codes and tick marks only as framing, never as fabricated measurements.
- Do keep actual local/provider/session state as the sole source of status indicators.
- Do preserve keyboard navigation, labels, loading, empty, error, disabled, recovery, and approval states.
- Do keep long paths, task text, tool output, and session errors readable at all supported widths.
- Don't put noise, hatching, or distressed textures under readable text.
- Don't change product claims, provider wording, workflows, or local-first behavior for visual effect.
- Don't add rounded pill controls, glossy gradients, or soft neon shadows.
