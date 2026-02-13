// src/front/utils/poseConstants.js
// MediaPipe Pose Landmark Indices - OFFICIAL REFERENCE
// https://developers.google.com/mediapipe/solutions/vision/pose_landmarker

export const POSE_LANDMARKS = {
  // Face
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,

  // Upper Body
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,

  // Hands
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,

  // Lower Body
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

// Standard humanoid bone names (compatible with Mixamo, Unity, Ready Player Me)
export const STANDARD_BONES = {
  // Spine
  HIPS: 'Hips',
  SPINE: 'Spine',
  SPINE1: 'Spine1',
  SPINE2: 'Spine2',
  CHEST: 'Chest',
  NECK: 'Neck',
  HEAD: 'Head',

  // Left Arm
  LEFT_SHOULDER: 'LeftShoulder',
  LEFT_UPPER_ARM: 'LeftUpperArm',
  LEFT_LOWER_ARM: 'LeftLowerArm',
  LEFT_HAND: 'LeftHand',

  // Right Arm
  RIGHT_SHOULDER: 'RightShoulder',
  RIGHT_UPPER_ARM: 'RightUpperArm',
  RIGHT_LOWER_ARM: 'RightLowerArm',
  RIGHT_HAND: 'RightHand',

  // Left Leg
  LEFT_UPPER_LEG: 'LeftUpperLeg',
  LEFT_LOWER_LEG: 'LeftLowerLeg',
  LEFT_FOOT: 'LeftFoot',
  LEFT_TOE: 'LeftToe',

  // Right Leg
  RIGHT_UPPER_LEG: 'RightUpperLeg',
  RIGHT_LOWER_LEG: 'RightLowerLeg',
  RIGHT_FOOT: 'RightFoot',
  RIGHT_TOE: 'RightToe',
};

// Map MediaPipe landmark index to avatar bone name
export const POSE_TO_BONE_MAP = {
  // Head & Face
  [POSE_LANDMARKS.NOSE]: STANDARD_BONES.HEAD,

  // Left Arm Chain
  [POSE_LANDMARKS.LEFT_SHOULDER]: STANDARD_BONES.LEFT_SHOULDER,
  [POSE_LANDMARKS.LEFT_ELBOW]: STANDARD_BONES.LEFT_UPPER_ARM,
  [POSE_LANDMARKS.LEFT_WRIST]: STANDARD_BONES.LEFT_LOWER_ARM,
  [POSE_LANDMARKS.LEFT_INDEX]: STANDARD_BONES.LEFT_HAND,

  // Right Arm Chain
  [POSE_LANDMARKS.RIGHT_SHOULDER]: STANDARD_BONES.RIGHT_SHOULDER,
  [POSE_LANDMARKS.RIGHT_ELBOW]: STANDARD_BONES.RIGHT_UPPER_ARM,
  [POSE_LANDMARKS.RIGHT_WRIST]: STANDARD_BONES.RIGHT_LOWER_ARM,
  [POSE_LANDMARKS.RIGHT_INDEX]: STANDARD_BONES.RIGHT_HAND,

  // Left Leg Chain
  [POSE_LANDMARKS.LEFT_HIP]: STANDARD_BONES.LEFT_UPPER_LEG,
  [POSE_LANDMARKS.LEFT_KNEE]: STANDARD_BONES.LEFT_LOWER_LEG,
  [POSE_LANDMARKS.LEFT_ANKLE]: STANDARD_BONES.LEFT_FOOT,
  [POSE_LANDMARKS.LEFT_FOOT_INDEX]: STANDARD_BONES.LEFT_TOE,

  // Right Leg Chain
  [POSE_LANDMARKS.RIGHT_HIP]: STANDARD_BONES.RIGHT_UPPER_LEG,
  [POSE_LANDMARKS.RIGHT_KNEE]: STANDARD_BONES.RIGHT_LOWER_LEG,
  [POSE_LANDMARKS.RIGHT_ANKLE]: STANDARD_BONES.RIGHT_FOOT,
  [POSE_LANDMARKS.RIGHT_FOOT_INDEX]: STANDARD_BONES.RIGHT_TOE,
};

// Bone connections for calculating rotations
// Each entry: [parentLandmark, childLandmark, boneName]
export const BONE_CONNECTIONS = [
  // Spine (calculated from shoulders and hips)
  { bone: STANDARD_BONES.HIPS, from: POSE_LANDMARKS.LEFT_HIP, to: POSE_LANDMARKS.RIGHT_HIP },
  
  // Left Arm
  { bone: STANDARD_BONES.LEFT_UPPER_ARM, from: POSE_LANDMARKS.LEFT_SHOULDER, to: POSE_LANDMARKS.LEFT_ELBOW },
  { bone: STANDARD_BONES.LEFT_LOWER_ARM, from: POSE_LANDMARKS.LEFT_ELBOW, to: POSE_LANDMARKS.LEFT_WRIST },
  { bone: STANDARD_BONES.LEFT_HAND, from: POSE_LANDMARKS.LEFT_WRIST, to: POSE_LANDMARKS.LEFT_INDEX },

  // Right Arm
  { bone: STANDARD_BONES.RIGHT_UPPER_ARM, from: POSE_LANDMARKS.RIGHT_SHOULDER, to: POSE_LANDMARKS.RIGHT_ELBOW },
  { bone: STANDARD_BONES.RIGHT_LOWER_ARM, from: POSE_LANDMARKS.RIGHT_ELBOW, to: POSE_LANDMARKS.RIGHT_WRIST },
  { bone: STANDARD_BONES.RIGHT_HAND, from: POSE_LANDMARKS.RIGHT_WRIST, to: POSE_LANDMARKS.RIGHT_INDEX },

  // Left Leg
  { bone: STANDARD_BONES.LEFT_UPPER_LEG, from: POSE_LANDMARKS.LEFT_HIP, to: POSE_LANDMARKS.LEFT_KNEE },
  { bone: STANDARD_BONES.LEFT_LOWER_LEG, from: POSE_LANDMARKS.LEFT_KNEE, to: POSE_LANDMARKS.LEFT_ANKLE },
  { bone: STANDARD_BONES.LEFT_FOOT, from: POSE_LANDMARKS.LEFT_ANKLE, to: POSE_LANDMARKS.LEFT_FOOT_INDEX },

  // Right Leg
  { bone: STANDARD_BONES.RIGHT_UPPER_LEG, from: POSE_LANDMARKS.RIGHT_HIP, to: POSE_LANDMARKS.RIGHT_KNEE },
  { bone: STANDARD_BONES.RIGHT_LOWER_LEG, from: POSE_LANDMARKS.RIGHT_KNEE, to: POSE_LANDMARKS.RIGHT_ANKLE },
  { bone: STANDARD_BONES.RIGHT_FOOT, from: POSE_LANDMARKS.RIGHT_ANKLE, to: POSE_LANDMARKS.RIGHT_FOOT_INDEX },

  // Head
  { bone: STANDARD_BONES.HEAD, from: POSE_LANDMARKS.LEFT_EAR, to: POSE_LANDMARKS.RIGHT_EAR },
];

// Alternative bone name mappings for different avatar formats
export const BONE_NAME_ALIASES = {
  // Mixamo style
  'mixamorig:LeftArm': STANDARD_BONES.LEFT_UPPER_ARM,
  'mixamorig1:LeftArm': STANDARD_BONES.LEFT_UPPER_ARM,
  'mixamorig:LeftForeArm': STANDARD_BONES.LEFT_LOWER_ARM,
  'mixamorig:RightArm': STANDARD_BONES.RIGHT_UPPER_ARM,
  'mixamorig:RightForeArm': STANDARD_BONES.RIGHT_LOWER_ARM,
  'mixamorig:LeftUpLeg': STANDARD_BONES.LEFT_UPPER_LEG,
  'mixamorig:LeftLeg': STANDARD_BONES.LEFT_LOWER_LEG,
  'mixamorig:RightUpLeg': STANDARD_BONES.RIGHT_UPPER_LEG,
  'mixamorig:RightLeg': STANDARD_BONES.RIGHT_LOWER_LEG,

  // Unity Humanoid style
  'LeftArm': STANDARD_BONES.LEFT_UPPER_ARM,
  'LeftForeArm': STANDARD_BONES.LEFT_LOWER_ARM,
  'RightArm': STANDARD_BONES.RIGHT_UPPER_ARM,
  'RightForeArm': STANDARD_BONES.RIGHT_LOWER_ARM,
  'LeftUpLeg': STANDARD_BONES.LEFT_UPPER_LEG,
  'LeftLeg': STANDARD_BONES.LEFT_LOWER_LEG,
  'RightUpLeg': STANDARD_BONES.RIGHT_UPPER_LEG,
  'RightLeg': STANDARD_BONES.RIGHT_LOWER_LEG,
};

export default {
  POSE_LANDMARKS,
  STANDARD_BONES,
  POSE_TO_BONE_MAP,
  BONE_CONNECTIONS,
  BONE_NAME_ALIASES,
};
// Mixamorig1 aliases (for some Mixamo exports)
export const MIXAMO_BONE_MAP = {
  'mixamorig1:Hips': 'Hips',
  'mixamorig1:Spine': 'Spine',
  'mixamorig1:Spine1': 'Spine1',
  'mixamorig1:Spine2': 'Spine2',
  'mixamorig1:Neck': 'Neck',
  'mixamorig1:Head': 'Head',
  'mixamorig1:LeftShoulder': 'LeftShoulder',
  'mixamorig1:LeftArm': 'LeftUpperArm',
  'mixamorig1:LeftForeArm': 'LeftLowerArm',
  'mixamorig1:LeftHand': 'LeftHand',
  'mixamorig1:RightShoulder': 'RightShoulder',
  'mixamorig1:RightArm': 'RightUpperArm',
  'mixamorig1:RightForeArm': 'RightLowerArm',
  'mixamorig1:RightHand': 'RightHand',
  'mixamorig1:LeftUpLeg': 'LeftUpperLeg',
  'mixamorig1:LeftLeg': 'LeftLowerLeg',
  'mixamorig1:LeftFoot': 'LeftFoot',
  'mixamorig1:RightUpLeg': 'RightUpperLeg',
  'mixamorig1:RightLeg': 'RightLowerLeg',
  'mixamorig1:RightFoot': 'RightFoot',
};
