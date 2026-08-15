/* Mirrors snippets/icon.liquid so the harness and the theme draw the same set. */
const P = {
 "cart": "<path d=\"M2.5 3h2.2l2.2 10.4a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.55L20 7H6.2\"/><circle cx=\"9.5\" cy=\"19\" r=\"1.6\"/><circle cx=\"17\" cy=\"19\" r=\"1.6\"/>",
 "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"M15.5 15.5 21 21\"/>",
 "user": "<circle cx=\"12\" cy=\"8\" r=\"3.8\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>",
 "heart": "<path d=\"M12 20.2 4.6 13a4.6 4.6 0 1 1 7.4-5.3A4.6 4.6 0 1 1 19.4 13Z\"/>",
 "truck": "<path d=\"M2.5 6.5h11v9h-11z\"/><path d=\"M13.5 10h4l3 3.2v2.3h-7z\"/><circle cx=\"6.5\" cy=\"17.5\" r=\"1.8\"/><circle cx=\"17\" cy=\"17.5\" r=\"1.8\"/>",
 "shield": "<path d=\"M12 3 4.5 6v5.4c0 4.3 3 8.2 7.5 9.6 4.5-1.4 7.5-5.3 7.5-9.6V6Z\"/>",
 "shield-check": "<path d=\"M12 3 4.5 6v5.4c0 4.3 3 8.2 7.5 9.6 4.5-1.4 7.5-5.3 7.5-9.6V6Z\"/><path d=\"m9 12 2.2 2.2L15.5 10\"/>",
 "lock": "<rect x=\"4.5\" y=\"10\" width=\"15\" height=\"10\" rx=\"2\"/><path d=\"M8 10V7.5a4 4 0 0 1 8 0V10\"/>",
 "card": "<rect x=\"2.5\" y=\"5\" width=\"19\" height=\"14\" rx=\"2\"/><path d=\"M2.5 9.5h19\"/>",
 "cash": "<rect x=\"2.5\" y=\"6\" width=\"19\" height=\"12\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2.6\"/>",
 "check": "<path d=\"m5 12.5 4.5 4.5L19 7.5\"/>",
 "star": "<path d=\"m12 3.5 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8Z\"/>",
 "flame": "<path d=\"M12 3s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.5.6-2.7 1.3-3.6.2 1.4 1 2.3 1.9 2.3 1.3 0 1.3-1.7 1.3-6.7Z\"/>",
 "clock": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7v5.3l3.4 2\"/>",
 "headset": "<path d=\"M4.5 15v-3a7.5 7.5 0 0 1 15 0v3\"/><rect x=\"2.8\" y=\"14\" width=\"4\" height=\"6\" rx=\"1.6\"/><rect x=\"17.2\" y=\"14\" width=\"4\" height=\"6\" rx=\"1.6\"/>",
 "refresh": "<path d=\"M20 12a8 8 0 1 1-2.5-5.8\"/><path d=\"M20 4v4.5h-4.5\"/>",
 "box": "<path d=\"m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9Z\"/><path d=\"M3.5 7.5 12 12l8.5-4.5M12 12v9\"/>",
 "phone": "<rect x=\"6.5\" y=\"2.5\" width=\"11\" height=\"19\" rx=\"2.5\"/><path d=\"M10.5 18.5h3\"/>",
 "share": "<circle cx=\"18\" cy=\"5.5\" r=\"2.5\"/><circle cx=\"6\" cy=\"12\" r=\"2.5\"/><circle cx=\"18\" cy=\"18.5\" r=\"2.5\"/><path d=\"m8.3 10.8 7.4-4M8.3 13.2l7.4 4\"/>",
 "chevron": "<path d=\"m9 5 7 7-7 7\"/>",
 "chevron-down": "<path d=\"m5 9 7 7 7-7\"/>",
 "filter": "<path d=\"M3.5 6h17M6.5 12h11M10 18h4\"/>",
 "sort": "<path d=\"M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3\"/>",
 "play": "<path d=\"M8.5 6.5 17 12l-8.5 5.5Z\"/>",
 "close": "<path d=\"m6 6 12 12M18 6 6 18\"/>",
 "menu": "<path d=\"M3.5 7h17M3.5 12h17M3.5 17h17\"/>",
 "home": "<path d=\"m3.5 10.5 8.5-7 8.5 7V20a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 20Z\"/>",
 "tag": "<path d=\"M3.5 11.5v-7a1 1 0 0 1 1-1h7l9 9-8 8Z\"/><circle cx=\"7.8\" cy=\"7.8\" r=\"1.3\"/>",
 "gift": "<rect x=\"3\" y=\"8.5\" width=\"18\" height=\"12.5\" rx=\"1.5\"/><path d=\"M3 13h18M12 8.5V21\"/><path d=\"M12 8.5S10.5 3 8 3a2.5 2.5 0 0 0 0 5.5ZM12 8.5S13.5 3 16 3a2.5 2.5 0 0 1 0 5.5Z\"/>"
};

export function icon(name, cls = "", weight = 1.7) {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ""}</svg>`;
}
