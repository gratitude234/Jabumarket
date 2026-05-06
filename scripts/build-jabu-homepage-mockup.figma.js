// Paste this into a Figma `use_figma` call when the Figma MCP quota is available.
// It builds an editable Jabu Market Study Hub homepage mockup from public/study-home-mockup.html.

const createdNodeIds = [];

const fontsToLoad = [
  { family: "Inter", style: "Regular" },
  { family: "Inter", style: "Medium" },
  { family: "Inter", style: "Semi Bold" },
  { family: "Inter", style: "Bold" },
  { family: "Inter", style: "Extra Bold" },
  { family: "Inter", style: "Black" },
];

for (const font of fontsToLoad) {
  await figma.loadFontAsync(font);
}

const C = {
  ink: { r: 23 / 255, g: 23 / 255, b: 23 / 255 },
  muted: { r: 107 / 255, g: 114 / 255, b: 128 / 255 },
  soft: { r: 246 / 255, g: 247 / 255, b: 251 / 255 },
  line: { r: 229 / 255, g: 231 / 255, b: 235 / 255 },
  paper: { r: 1, g: 1, b: 1 },
  canvas: { r: 244 / 255, g: 246 / 255, b: 251 / 255 },
  screen: { r: 251 / 255, g: 251 / 255, b: 253 / 255 },
  violet: { r: 91 / 255, g: 53 / 255, b: 213 / 255 },
  violetSoft: { r: 238 / 255, g: 237 / 255, b: 254 / 255 },
  teal: { r: 15 / 255, g: 118 / 255, b: 110 / 255 },
  tealSoft: { r: 230 / 255, g: 245 / 255, b: 242 / 255 },
  amber: { r: 180 / 255, g: 83 / 255, b: 9 / 255 },
  blue: { r: 37 / 255, g: 99 / 255, b: 235 / 255 },
};

function solid(color, opacity = 1) {
  return [{ type: "SOLID", color, opacity }];
}

function shadow(x, y, blur, color, opacity) {
  return [
    {
      type: "DROP_SHADOW",
      color: { ...color, a: opacity },
      offset: { x, y },
      radius: blur,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
}

function track(node) {
  createdNodeIds.push(node.id);
  return node;
}

function frame(name, width, height, fill, radius = 0) {
  const node = track(figma.createFrame());
  node.name = name;
  node.resize(width, height);
  node.fills = fill ? solid(fill) : [];
  node.strokes = [];
  node.cornerRadius = radius;
  node.clipsContent = false;
  return node;
}

function makeAuto(node, mode, gap, pad) {
  node.layoutMode = mode;
  node.itemSpacing = gap;
  node.paddingTop = pad.t || 0;
  node.paddingRight = pad.r || 0;
  node.paddingBottom = pad.b || 0;
  node.paddingLeft = pad.l || 0;
  return node;
}

function append(parent, child, fillX = false) {
  parent.appendChild(child);
  if (fillX) child.layoutSizingHorizontal = "FILL";
  return child;
}

function text(name, value, size, color = C.ink, style = "Regular", width = null, lineHeight = 1.2) {
  const node = track(figma.createText());
  node.name = name;
  node.fontName = { family: "Inter", style };
  node.characters = value;
  node.fontSize = size;
  node.lineHeight = { unit: "PIXELS", value: Math.round(size * lineHeight) };
  node.letterSpacing = { unit: "PIXELS", value: 0 };
  node.fills = solid(color);

  if (width) {
    node.resize(width, Math.max(size * lineHeight, 18));
    node.textAutoResize = "HEIGHT";
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }

  return node;
}

function badge(label) {
  const node = makeAuto(frame(`Hero badge / ${label}`, 10, 10, C.paper, 999), "HORIZONTAL", 0, {
    t: 7,
    r: 10,
    b: 7,
    l: 10,
  });
  node.primaryAxisSizingMode = "AUTO";
  node.counterAxisSizingMode = "AUTO";
  node.fills = solid(C.paper, 0.16);
  append(node, text("Label", label, 11, C.paper, "Extra Bold"));
  return node;
}

function tab(label, active = false) {
  const node = makeAuto(frame(`Tab / ${label}`, 10, 10, active ? C.violet : C.paper, 999), "HORIZONTAL", 0, {
    t: 8,
    r: 12,
    b: 8,
    l: 12,
  });
  node.primaryAxisSizingMode = "AUTO";
  node.counterAxisSizingMode = "AUTO";
  node.strokes = active ? [] : solid(C.line);
  append(node, text("Label", label, 12, active ? C.paper : { r: 82 / 255, g: 88 / 255, b: 102 / 255 }, "Extra Bold"));
  return node;
}

function button(label, primary = true) {
  const node = makeAuto(frame(`Button / ${label}`, 10, 42, primary ? C.paper : C.violet, 14), "HORIZONTAL", 0, {
    t: 10,
    r: 12,
    b: 10,
    l: 12,
  });
  node.primaryAxisSizingMode = "AUTO";
  node.counterAxisSizingMode = "FIXED";
  node.primaryAxisAlignItems = "CENTER";
  node.counterAxisAlignItems = "CENTER";
  if (!primary) {
    node.fills = solid(C.paper, 0.1);
    node.strokes = solid(C.paper, 0.24);
  }
  append(node, text("Label", label, 13, primary ? C.violet : C.paper, "Extra Bold"));
  return node;
}

function sectionHeader(title, link) {
  const node = makeAuto(frame(`Section header / ${title}`, 370, 24, null), "HORIZONTAL", 12, {
    t: 0,
    r: 0,
    b: 0,
    l: 0,
  });
  node.primaryAxisAlignItems = "SPACE_BETWEEN";
  node.counterAxisAlignItems = "CENTER";
  append(node, text("Title", title, 16, C.ink, "Bold"));
  append(node, text("Link", link, 12, C.violet, "Extra Bold"));
  return node;
}

function actionCard(letter, title, copy, color) {
  const card = makeAuto(frame(`Quick action / ${title}`, 178, 126, C.paper, 18), "VERTICAL", 0, {
    t: 13,
    r: 13,
    b: 13,
    l: 13,
  });
  card.strokes = solid(C.line);

  const icon = frame(`Icon / ${letter}`, 38, 38, color, 13);
  icon.layoutMode = "VERTICAL";
  icon.primaryAxisAlignItems = "CENTER";
  icon.counterAxisAlignItems = "CENTER";
  append(icon, text("Letter", letter, 14, C.paper, "Black"));
  append(card, icon);

  append(card, text("Title", title, 14, C.ink, "Extra Bold"));
  append(card, text("Description", copy, 12, C.muted, "Regular", 145, 1.35), true);
  return card;
}

function metric(value, label) {
  const node = makeAuto(frame(`Metric / ${label}`, 116, 74, C.paper, 17), "VERTICAL", 5, {
    t: 12,
    r: 12,
    b: 12,
    l: 12,
  });
  node.strokes = solid(C.line);
  append(node, text("Value", value, 20, C.ink, "Bold"));
  append(node, text("Label", label, 11, C.muted, "Bold"));
  return node;
}

function course(color, title, meta, status) {
  const row = makeAuto(frame(`Course / ${title}`, 370, 70, C.paper, 18), "HORIZONTAL", 12, {
    t: 12,
    r: 12,
    b: 12,
    l: 12,
  });
  row.counterAxisAlignItems = "CENTER";
  row.strokes = solid(C.line);

  append(row, frame("Course color marker", 9, 44, color, 999));

  const body = makeAuto(frame("Course text", 240, 46, null), "VERTICAL", 4, { t: 0, r: 0, b: 0, l: 0 });
  append(body, text("Course title", title, 14, C.ink, "Extra Bold", 240, 1.15));
  append(body, text("Course meta", meta, 12, C.muted, "Regular", 240, 1.2));
  append(row, body);

  const chip = makeAuto(frame(`Status / ${status}`, 10, 10, C.soft, 999), "HORIZONTAL", 0, {
    t: 7,
    r: 9,
    b: 7,
    l: 9,
  });
  chip.primaryAxisSizingMode = "AUTO";
  chip.counterAxisSizingMode = "AUTO";
  append(chip, text("Label", status, 11, { r: 75 / 255, g: 85 / 255, b: 99 / 255 }, "Extra Bold"));
  append(row, chip);

  return row;
}

function navItem(label, active = false) {
  const node = makeAuto(frame(`Nav / ${label}`, 74, 56, active ? C.violetSoft : C.paper, 17), "VERTICAL", 3, {
    t: 7,
    r: 4,
    b: 6,
    l: 4,
  });
  node.primaryAxisAlignItems = "CENTER";
  node.counterAxisAlignItems = "CENTER";
  const icon = label === "Study" ? "⌂" : label === "Library" ? "▤" : label === "Practice" ? "○" : label === "Q&A" ? "?" : "◡";
  append(node, text("Icon", icon, 17, active ? C.violet : { r: 113 / 255, g: 113 / 255, b: 122 / 255 }));
  append(node, text("Label", label, 10, active ? C.violet : { r: 113 / 255, g: 113 / 255, b: 122 / 255 }, "Extra Bold"));
  return node;
}

const page = figma.createPage();
page.name = "Jabu Market Homepage Mockup";
await figma.setCurrentPageAsync(page);

const canvas = frame("Mockup canvas", 1180, 1040, C.canvas);
canvas.x = 120;
canvas.y = 80;
canvas.layoutMode = "HORIZONTAL";
canvas.itemSpacing = 28;
canvas.paddingTop = 48;
canvas.paddingRight = 48;
canvas.paddingBottom = 48;
canvas.paddingLeft = 48;
canvas.counterAxisAlignItems = "MIN";
figma.currentPage.appendChild(canvas);

const phone = frame("Phone shell / Study Hub home", 430, 948, C.paper, 34);
phone.strokes = solid(C.ink, 0.08);
phone.effects = shadow(0, 18, 50, C.ink, 0.08);
phone.clipsContent = true;
append(canvas, phone);

const screen = makeAuto(frame("Screen", 430, 948, C.screen, 34), "VERTICAL", 0, { t: 18, r: 16, b: 20, l: 16 });
screen.clipsContent = true;
append(phone, screen);

const topbar = makeAuto(frame("Top bar", 398, 56, null), "HORIZONTAL", 14, { t: 4, r: 2, b: 14, l: 2 });
topbar.primaryAxisAlignItems = "SPACE_BETWEEN";
topbar.counterAxisAlignItems = "CENTER";
append(screen, topbar, true);

const brand = makeAuto(frame("Brand greeting", 280, 46, null), "VERTICAL", 3, { t: 0, r: 0, b: 0, l: 0 });
append(brand, text("Eyebrow", "Study Hub", 12, C.muted, "Bold"));
append(brand, text("Greeting", "Good morning, Tolu", 24, C.ink, "Bold", 260, 1.08));
append(topbar, brand);

const avatar = frame("Avatar / TO", 42, 42, C.violet, 15);
avatar.fills = [
  {
    type: "GRADIENT_LINEAR",
    gradientTransform: [
      [0.707, 0.707, 0],
      [-0.707, 0.707, 0.5],
    ],
    gradientStops: [
      { position: 0, color: { ...C.violet, a: 1 } },
      { position: 1, color: { ...C.teal, a: 1 } },
    ],
  },
];
avatar.layoutMode = "VERTICAL";
avatar.primaryAxisAlignItems = "CENTER";
avatar.counterAxisAlignItems = "CENTER";
append(avatar, text("Initials", "TO", 14, C.paper, "Extra Bold"));
append(topbar, avatar);

const search = makeAuto(frame("Search", 398, 44, C.paper, 16), "HORIZONTAL", 10, { t: 0, r: 13, b: 0, l: 13 });
search.counterAxisAlignItems = "CENTER";
search.strokes = solid(C.line);
append(search, text("Icon", "⌕", 18, { r: 138 / 255, g: 143 / 255, b: 156 / 255 }));
append(search, text("Placeholder", "Search courses, materials, questions", 14, { r: 138 / 255, g: 143 / 255, b: 156 / 255 }));
append(screen, search, true);

const tabs = makeAuto(frame("Shortcut tabs", 398, 56, null), "HORIZONTAL", 8, { t: 14, r: 0, b: 10, l: 0 });
append(tabs, tab("For you", true));
append(tabs, tab("Library"));
append(tabs, tab("Practice"));
append(tabs, tab("Q&A"));
append(screen, tabs, true);

const hero = makeAuto(frame("Hero / Semester resume", 398, 280, C.violet, 26), "VERTICAL", 12, {
  t: 18,
  r: 18,
  b: 18,
  l: 18,
});
hero.fills = [
  {
    type: "GRADIENT_LINEAR",
    gradientTransform: [
      [0.76, 0.65, -0.18],
      [-0.65, 0.76, 0.42],
    ],
    gradientStops: [
      { position: 0, color: { ...C.violet, a: 0.96 } },
      { position: 1, color: { ...C.teal, a: 0.94 } },
    ],
  },
];
hero.clipsContent = true;
append(screen, hero, true);

const heroMeta = makeAuto(frame("Hero meta", 362, 28, null), "HORIZONTAL", 12, { t: 0, r: 0, b: 0, l: 0 });
heroMeta.primaryAxisAlignItems = "SPACE_BETWEEN";
heroMeta.counterAxisAlignItems = "CENTER";
append(heroMeta, badge("CSC 302 next"));
append(heroMeta, badge("18 day streak"));
append(hero, heroMeta, true);

append(hero, text("Hero title", "Pick up where your semester left off", 26, C.paper, "Bold", 300, 1.08));
append(
  hero,
  text(
    "Hero copy",
    "Your saved materials, due practice, and active course questions are grouped into one study flow.",
    13,
    { r: 0.88, g: 0.9, b: 0.94 },
    "Regular",
    310,
    1.45,
  ),
);

const heroActions = makeAuto(frame("Hero actions", 362, 44, null), "HORIZONTAL", 9, { t: 0, r: 0, b: 0, l: 0 });
append(heroActions, button("Resume practice", true));
append(heroActions, button("Open library", false));
append(hero, heroActions, true);

const visual = makeAuto(frame("Study visual", 362, 72, null), "HORIZONTAL", 10, { t: 0, r: 0, b: 0, l: 0 });
const paper = makeAuto(frame("Paper stack", 212, 72, C.paper, 18), "VERTICAL", 8, { t: 14, r: 12, b: 12, l: 12 });
paper.fills = solid(C.paper, 0.12);
paper.strokes = solid(C.paper, 0.18);
append(paper, frame("Paper line 1", 160, 7, C.paper, 999));
append(paper, frame("Paper line 2", 142, 7, C.paper, 999));
append(paper, frame("Paper line 3 short", 100, 7, C.paper, 999));
append(visual, paper);

const score = makeAuto(frame("Score tile", 140, 72, C.paper, 18), "VERTICAL", 5, { t: 12, r: 12, b: 12, l: 12 });
score.fills = solid(C.paper, 0.12);
score.strokes = solid(C.paper, 0.18);
append(score, text("Score", "82%", 27, C.paper, "Black"));
append(score, text("Score label", "Last practice", 11, { r: 0.86, g: 0.89, b: 0.92 }, "Bold"));
append(visual, score);
append(hero, visual, true);

const quick = makeAuto(frame("Section / Quick actions", 398, 312, null), "VERTICAL", 10, { t: 18, r: 0, b: 0, l: 0 });
append(quick, sectionHeader("Quick actions", "More"), true);
const quickRow1 = makeAuto(frame("Quick actions row 1", 398, 126, null), "HORIZONTAL", 10, { t: 0, r: 0, b: 0, l: 0 });
append(quickRow1, actionCard("L", "Library", "Find notes, PDFs, and past questions", C.violet));
append(quickRow1, actionCard("P", "Practice", "Take CBT sets by course", C.teal));
append(quick, quickRow1, true);
const quickRow2 = makeAuto(frame("Quick actions row 2", 398, 126, null), "HORIZONTAL", 10, { t: 0, r: 0, b: 0, l: 0 });
append(quickRow2, actionCard("Q", "Ask Q&A", "Post a course question", C.blue));
append(quickRow2, actionCard("G", "GPA", "Calculate semester standing", C.amber));
append(quick, quickRow2, true);
append(screen, quick, true);

const progress = makeAuto(frame("Section / Your progress", 398, 126, null), "VERTICAL", 10, { t: 18, r: 0, b: 0, l: 0 });
append(progress, sectionHeader("Your progress", "History"), true);
const metrics = makeAuto(frame("Progress metrics", 398, 74, null), "HORIZONTAL", 9, { t: 0, r: 0, b: 0, l: 0 });
append(metrics, metric("18", "Streak"));
append(metrics, metric("12", "Saved"));
append(metrics, metric("42", "Answered"));
append(progress, metrics, true);
append(screen, progress, true);

const due = makeAuto(frame("Due today card", 398, 100, C.tealSoft, 22), "HORIZONTAL", 12, { t: 15, r: 15, b: 15, l: 15 });
due.counterAxisAlignItems = "CENTER";
due.primaryAxisAlignItems = "SPACE_BETWEEN";
due.strokes = solid({ r: 217 / 255, g: 232 / 255, b: 228 / 255 });
const dueText = makeAuto(frame("Due copy", 235, 70, null), "VERTICAL", 4, { t: 0, r: 0, b: 0, l: 0 });
append(dueText, text("Due title", "Due today", 15, C.ink, "Bold"));
append(
  dueText,
  text("Due details", "3 spaced-repetition questions are ready from CSC 302 and MTH 211.", 12, { r: 70 / 255, g: 99 / 255, b: 94 / 255 }, "Regular", 225, 1.4),
);
append(due, dueText);
append(due, button("Start", true));
append(screen, due, true);

const courses = makeAuto(frame("Section / For your courses", 398, 272, null), "VERTICAL", 9, { t: 18, r: 0, b: 0, l: 0 });
append(courses, sectionHeader("For your courses", "Edit"), true);
append(courses, course(C.violet, "CSC 302: Database Systems", "4 new materials, 2 practice sets", "Open"), true);
append(courses, course(C.teal, "MTH 211: Linear Algebra", "1 unanswered question", "Q&A"), true);
append(courses, course(C.amber, "GST 204: Entrepreneurship", "Past questions updated", "New"), true);
append(screen, courses, true);

const nav = makeAuto(frame("Bottom nav", 398, 72, C.paper, 24), "HORIZONTAL", 4, { t: 8, r: 8, b: 8, l: 8 });
nav.strokes = solid(C.ink, 0.08);
nav.effects = shadow(0, 16, 42, C.ink, 0.12);
nav.x = 16;
nav.y = 858;
phone.appendChild(nav);
append(nav, navItem("Study", true));
append(nav, navItem("Library"));
append(nav, navItem("Practice"));
append(nav, navItem("Q&A"));
append(nav, navItem("Me"));

const notes = makeAuto(frame("Design notes", 560, 554, C.paper, 28), "VERTICAL", 18, { t: 22, r: 22, b: 22, l: 22 });
notes.strokes = solid(C.line);
notes.effects = shadow(0, 18, 50, C.ink, 0.08);
append(canvas, notes);
append(notes, text("Notes eyebrow", "Design direction", 12, C.muted, "Bold"));
append(notes, text("Notes title", "Study Home as a focused academic dashboard", 24, C.ink, "Bold", 460, 1.2));
append(
  notes,
  text(
    "Notes copy",
    "This mockup separates Study Hub from the marketplace by giving it its own navigation, academic stats, course-first content, and a calmer study palette. The page opens directly into work, not marketing.",
    14,
    C.muted,
    "Regular",
    490,
    1.55,
  ),
);

const preview = makeAuto(frame("Recommended Study bottom navigation", 496, 64, C.soft, 20), "HORIZONTAL", 6, { t: 8, r: 8, b: 8, l: 8 });
preview.strokes = solid(C.line);
["Study", "Library", "Practice", "Q&A", "Me"].forEach((label, index) => {
  const item = makeAuto(frame(`Preview / ${label}`, 92, 46, index === 0 ? C.violet : C.paper, 14), "VERTICAL", 0, {
    t: 0,
    r: 0,
    b: 0,
    l: 0,
  });
  item.primaryAxisAlignItems = "CENTER";
  item.counterAxisAlignItems = "CENTER";
  append(item, text("Label", label, 11, index === 0 ? C.paper : { r: 82 / 255, g: 88 / 255, b: 102 / 255 }, "Extra Bold"));
  append(preview, item);
});
append(notes, preview, true);

function rule(title, body) {
  const node = makeAuto(frame(`Rule / ${title}`, 496, 76, C.paper, 18), "VERTICAL", 4, {
    t: 13,
    r: 13,
    b: 13,
    l: 13,
  });
  node.strokes = solid(C.line);
  append(node, text("Title", title, 13, C.ink, "Bold"));
  append(node, text("Body", body, 12, C.muted, "Regular", 455, 1.4));
  return node;
}

append(notes, rule("Primary job", "Help a student resume useful academic work in under ten seconds."), true);
append(notes, rule("Content priority", "Search, current courses, practice due today, saved materials, and Q&A activity."), true);
append(notes, rule("Product boundary", "Marketplace links stay out of the Study bottom nav. Product switching can live in profile."), true);

figma.viewport.scrollAndZoomIntoView([canvas]);

return {
  success: true,
  pageName: page.name,
  rootNodeId: canvas.id,
  phoneNodeId: phone.id,
  notesNodeId: notes.id,
  createdNodeIds,
};
