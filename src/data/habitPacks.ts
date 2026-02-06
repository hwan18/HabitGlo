export type HabitPack = {
  id: string
  title: string
  description: string
  habits: string[]
}

export const habitPacks: HabitPack[] = [
  {
    id: 'deep-flow',
    title: 'The Deep Flow Protocol',
    description:
      'Designed for software engineers, writers, and students who need to stay in the zone.',
    habits: [
      'ONE TASK AT A TIME',
      'CLOSE YOUR TABS',
      'PHONE IN THE OTHER ROOM',
      'IS THIS DEEP WORK?',
    ],
  },
  {
    id: 'biohacker',
    title: "The Biohacker's Baseline",
    description:
      'A baseline of physiological habits to maintain energy and metabolic health throughout the workday.',
    habits: [
      'NOSE BREATHING ONLY',
      'VIEW SUNLIGHT NOW',
      'SHOULDERS BACK / CHEST OUT',
      'HYDRATE + ELECTROLYTES',
      'BLINK OFTEN - EYES DRY',
    ],
  },
  {
    id: 'looksmaxxing',
    title: 'The Looksmaxxing Pack',
    description:
      'Targeted reminders for facial aesthetics, posture correction, and proper oral posture.',
    habits: [
      'TONGUE ON ROOF OF MOUTH',
      'CHIN TUCK NOW',
      'NO MOUTH BREATHING',
      'SWALLOW CORRECTLY',
      'RELAX JAW MUSCLES',
    ],
  },
  {
    id: 'stoic',
    title: 'The Stoic Resilience Pack',
    description:
      'Timeless mental models for emotional regulation and stress management during intense tasks.',
    habits: [
      'CONTROL THE CONTROLLABLE',
      'AMOR FATI - LOVE YOUR FATE',
      'NOTHING IS AS IT SEEMS',
      'THE OBSTACLE IS THE WAY',
    ],
  },
  {
    id: 'awareness',
    title: 'The Awareness & Freedom Pack',
    description:
      'Specifically for those struggling with Body-Focused Repetitive Behaviors (Skin picking, nail biting, hair pulling).',
    habits: [
      'HANDS IN YOUR LAP',
      'RELAX YOUR SHOULDERS',
      'TAKE A DEEP EXHALE',
      'THIS URGE WILL PASS',
      'SOFTEN YOUR GAZE',
    ],
  },
]
