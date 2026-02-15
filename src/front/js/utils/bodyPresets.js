// src/front/js/utils/bodyPresets.js
// Shared body proportion system for 2D puppet + 3D avatar
// Presets set all values at once, sliders allow fine-tuning
// Same data structure drives both renderers

// Default/baseline proportions (all values normalized 0-1 range, 0.5 = average)
export const DEFAULT_PROPORTIONS = {
  // Overall
  height: 0.5,        // short ↔ tall
  weight: 0.5,        // thin ↔ heavy

  // Upper body
  shoulderWidth: 0.5,  // narrow ↔ broad
  chestSize: 0.5,      // flat ↔ full
  torsoLength: 0.5,    // short ↔ long
  torsoWidth: 0.5,     // narrow ↔ wide
  waistWidth: 0.5,     // narrow ↔ wide

  // Arms
  armLength: 0.5,      // short ↔ long
  armThickness: 0.5,   // thin ↔ thick

  // Lower body
  hipWidth: 0.5,       // narrow ↔ wide
  legLength: 0.5,      // short ↔ long
  legThickness: 0.5,   // thin ↔ thick

  // Head
  headSize: 0.5,       // small ↔ large
  neckWidth: 0.5,      // thin ↔ thick
};

// Body type presets
export const BODY_PRESETS = {
  slim: {
    label: "Slim",
    emoji: "🧍",
    description: "Lean and narrow build",
    proportions: {
      height: 0.55,
      weight: 0.25,
      shoulderWidth: 0.35,
      chestSize: 0.3,
      torsoLength: 0.55,
      torsoWidth: 0.3,
      waistWidth: 0.25,
      armLength: 0.55,
      armThickness: 0.25,
      hipWidth: 0.3,
      legLength: 0.6,
      legThickness: 0.25,
      headSize: 0.45,
      neckWidth: 0.3,
    },
  },
  athletic: {
    label: "Athletic",
    emoji: "🏃",
    description: "Toned and fit build",
    proportions: {
      height: 0.55,
      weight: 0.45,
      shoulderWidth: 0.6,
      chestSize: 0.55,
      torsoLength: 0.5,
      torsoWidth: 0.45,
      waistWidth: 0.35,
      armLength: 0.5,
      armThickness: 0.45,
      hipWidth: 0.4,
      legLength: 0.55,
      legThickness: 0.45,
      headSize: 0.5,
      neckWidth: 0.45,
    },
  },
  average: {
    label: "Average",
    emoji: "🧑",
    description: "Standard proportions",
    proportions: { ...DEFAULT_PROPORTIONS },
  },
  muscular: {
    label: "Muscular",
    emoji: "💪",
    description: "Heavy muscle mass",
    proportions: {
      height: 0.55,
      weight: 0.7,
      shoulderWidth: 0.8,
      chestSize: 0.75,
      torsoLength: 0.5,
      torsoWidth: 0.65,
      waistWidth: 0.5,
      armLength: 0.5,
      armThickness: 0.75,
      hipWidth: 0.55,
      legLength: 0.5,
      legThickness: 0.7,
      headSize: 0.5,
      neckWidth: 0.7,
    },
  },
  stocky: {
    label: "Stocky",
    emoji: "🏋️",
    description: "Short and broad build",
    proportions: {
      height: 0.35,
      weight: 0.65,
      shoulderWidth: 0.65,
      chestSize: 0.6,
      torsoLength: 0.45,
      torsoWidth: 0.65,
      waistWidth: 0.6,
      armLength: 0.4,
      armThickness: 0.6,
      hipWidth: 0.6,
      legLength: 0.35,
      legThickness: 0.6,
      headSize: 0.55,
      neckWidth: 0.6,
    },
  },
  curvy: {
    label: "Curvy",
    emoji: "✨",
    description: "Full hips and chest",
    proportions: {
      height: 0.5,
      weight: 0.55,
      shoulderWidth: 0.45,
      chestSize: 0.7,
      torsoLength: 0.5,
      torsoWidth: 0.5,
      waistWidth: 0.4,
      armLength: 0.5,
      armThickness: 0.4,
      hipWidth: 0.75,
      legLength: 0.5,
      legThickness: 0.55,
      headSize: 0.48,
      neckWidth: 0.4,
    },
  },
  petite: {
    label: "Petite",
    emoji: "🌸",
    description: "Small and delicate frame",
    proportions: {
      height: 0.25,
      weight: 0.25,
      shoulderWidth: 0.3,
      chestSize: 0.3,
      torsoLength: 0.4,
      torsoWidth: 0.3,
      waistWidth: 0.25,
      armLength: 0.4,
      armThickness: 0.2,
      hipWidth: 0.35,
      legLength: 0.35,
      legThickness: 0.25,
      headSize: 0.5,
      neckWidth: 0.3,
    },
  },
  tallLean: {
    label: "Tall & Lean",
    emoji: "🦒",
    description: "Tall with long limbs",
    proportions: {
      height: 0.85,
      weight: 0.3,
      shoulderWidth: 0.4,
      chestSize: 0.35,
      torsoLength: 0.65,
      torsoWidth: 0.35,
      waistWidth: 0.3,
      armLength: 0.75,
      armThickness: 0.25,
      hipWidth: 0.35,
      legLength: 0.8,
      legThickness: 0.3,
      headSize: 0.45,
      neckWidth: 0.35,
    },
  },
};

// Slider definitions for the UI
export const BODY_SLIDERS = [
  { key: "height", label: "Height", group: "Overall", min: "Short", max: "Tall" },
  { key: "weight", label: "Weight", group: "Overall", min: "Light", max: "Heavy" },
  { key: "shoulderWidth", label: "Shoulders", group: "Upper Body", min: "Narrow", max: "Broad" },
  { key: "chestSize", label: "Chest", group: "Upper Body", min: "Flat", max: "Full" },
  { key: "torsoLength", label: "Torso Length", group: "Upper Body", min: "Short", max: "Long" },
  { key: "torsoWidth", label: "Torso Width", group: "Upper Body", min: "Narrow", max: "Wide" },
  { key: "waistWidth", label: "Waist", group: "Upper Body", min: "Narrow", max: "Wide" },
  { key: "armLength", label: "Arm Length", group: "Arms", min: "Short", max: "Long" },
  { key: "armThickness", label: "Arm Thickness", group: "Arms", min: "Thin", max: "Thick" },
  { key: "hipWidth", label: "Hips", group: "Lower Body", min: "Narrow", max: "Wide" },
  { key: "legLength", label: "Leg Length", group: "Lower Body", min: "Short", max: "Long" },
  { key: "legThickness", label: "Leg Thickness", group: "Lower Body", min: "Thin", max: "Thick" },
  { key: "headSize", label: "Head Size", group: "Head", min: "Small", max: "Large" },
  { key: "neckWidth", label: "Neck", group: "Head", min: "Thin", max: "Thick" },
];

// Convert normalized proportions (0-1) to 2D puppet style dimensions
export const proportionsToPuppetStyle = (proportions) => {
  const p = proportions;

  // Map 0-1 range to pixel dimensions
  const lerp = (min, max, t) => min + (max - min) * t;

  return {
    headRadius: lerp(28, 52, p.headSize),
    bodyWidth: lerp(30, 75, (p.torsoWidth + p.shoulderWidth) / 2),
    bodyHeight: lerp(50, 95, p.torsoLength),
    limbWidth: lerp(8, 22, (p.armThickness + p.legThickness) / 2),
    upperArmLength: lerp(35, 70, p.armLength),
    lowerArmLength: lerp(30, 65, p.armLength),
    upperLegLength: lerp(40, 80, p.legLength),
    lowerLegLength: lerp(35, 70, p.legLength),
    handRadius: lerp(6, 14, (p.armThickness + p.weight) / 2),
    footWidth: lerp(14, 28, p.weight),
    footHeight: lerp(6, 14, p.weight),
    // Derived widths for body shape
    shoulderWidthOffset: lerp(-10, 15, p.shoulderWidth),
    hipWidthOffset: lerp(-10, 15, p.hipWidth),
    waistNarrow: lerp(0, 12, 1 - p.waistWidth),
    chestOffset: lerp(0, 10, p.chestSize),
    neckWidth: lerp(8, 18, p.neckWidth),
  };
};

// Convert normalized proportions (0-1) to 3D bone scale values
// Used with avatar.getObjectByName(boneName).scale.set(x, y, z)
export const proportionsToBoneScales = (proportions) => {
  const p = proportions;

  // Map 0-1 to scale range (0.7 - 1.3 keeps it realistic)
  const toScale = (value, min = 0.7, max = 1.3) => min + (max - min) * value;

  return {
    // Spine / torso
    Hips: { x: toScale(p.hipWidth), y: 1, z: toScale(p.hipWidth, 0.85, 1.15) },
    Spine: { x: toScale(p.waistWidth), y: toScale(p.torsoLength, 0.85, 1.15), z: toScale(p.weight, 0.85, 1.15) },
    Spine1: { x: toScale(p.torsoWidth), y: 1, z: toScale(p.chestSize, 0.85, 1.15) },
    Spine2: { x: toScale(p.torsoWidth), y: 1, z: toScale(p.chestSize, 0.85, 1.15) },

    // Shoulders
    LeftShoulder: { x: toScale(p.shoulderWidth, 0.85, 1.15), y: 1, z: 1 },
    RightShoulder: { x: toScale(p.shoulderWidth, 0.85, 1.15), y: 1, z: 1 },

    // Arms
    LeftUpperArm: { x: toScale(p.armThickness, 0.75, 1.25), y: toScale(p.armLength, 0.85, 1.15), z: toScale(p.armThickness, 0.75, 1.25) },
    RightUpperArm: { x: toScale(p.armThickness, 0.75, 1.25), y: toScale(p.armLength, 0.85, 1.15), z: toScale(p.armThickness, 0.75, 1.25) },
    LeftLowerArm: { x: toScale(p.armThickness, 0.8, 1.2), y: toScale(p.armLength, 0.85, 1.15), z: toScale(p.armThickness, 0.8, 1.2) },
    RightLowerArm: { x: toScale(p.armThickness, 0.8, 1.2), y: toScale(p.armLength, 0.85, 1.15), z: toScale(p.armThickness, 0.8, 1.2) },

    // Legs
    LeftUpperLeg: { x: toScale(p.legThickness, 0.75, 1.25), y: toScale(p.legLength, 0.85, 1.15), z: toScale(p.legThickness, 0.75, 1.25) },
    RightUpperLeg: { x: toScale(p.legThickness, 0.75, 1.25), y: toScale(p.legLength, 0.85, 1.15), z: toScale(p.legThickness, 0.75, 1.25) },
    LeftLowerLeg: { x: toScale(p.legThickness, 0.8, 1.2), y: toScale(p.legLength, 0.85, 1.15), z: toScale(p.legThickness, 0.8, 1.2) },
    RightLowerLeg: { x: toScale(p.legThickness, 0.8, 1.2), y: toScale(p.legLength, 0.85, 1.15), z: toScale(p.legThickness, 0.8, 1.2) },

    // Head / neck
    Head: { x: toScale(p.headSize, 0.85, 1.15), y: toScale(p.headSize, 0.85, 1.15), z: toScale(p.headSize, 0.85, 1.15) },
    Neck: { x: toScale(p.neckWidth, 0.8, 1.2), y: 1, z: toScale(p.neckWidth, 0.8, 1.2) },
  };
};

// Apply bone scales to a Three.js avatar
export const applyProportionsToAvatar = (avatar, proportions) => {
  if (!avatar) return;

  const boneScales = proportionsToBoneScales(proportions);

  Object.entries(boneScales).forEach(([boneName, scale]) => {
    const bone = avatar.getObjectByName(boneName);
    if (bone) {
      bone.scale.set(scale.x, scale.y, scale.z);
    }
  });
};