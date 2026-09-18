export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// [start, end] for each row of the day, in order
export const ROW_TIMES = [
  ['09:00', '09:15'],
  ['09:20', '09:55'],
  ['09:55', '10:30'],
  ['10:30', '10:55'],
  ['10:55', '11:30'],
  ['11:30', '12:05'],
  ['12:10', '12:45'],
  ['12:45', '13:20'],
  ['13:20', '14:05'],
  ['14:05', '14:10'],
  ['14:15', '14:50'],
  ['14:50', '15:25'],
  ['15:25', '16:00'],
]

const REG = { subject: 'Registration', teacher: 'APU', room: 'Spanish Room', colour: 'other' }
const BREAK = { subject: 'Break', colour: 'other' }
const LUNCH = { subject: 'Lunch', colour: 'other' }

function row(subject, teacher, room, colour) {
  return { subject, teacher, room, colour }
}

export const WEEKS = {
  A: {
    Monday: [
      REG,
      row('English', 'MHO', 'S7', 'duncan'),
      row('English', 'MHO', 'S7', 'duncan'),
      BREAK,
      row('PE', 'JAL', 'Off Site 3', 'other'),
      row('PE', 'JAL', 'Off Site 3', 'other'),
      row('Biology', 'HTI', 'PH2', 'etienne'),
      row('Biology', 'HTI', 'PH2', 'etienne'),
      LUNCH,
      REG,
      row('Assembly', 'RBL', 'StM', 'other'),
      row('French', 'SGE', 'M2', 'none'),
      row('French', 'SGE', 'M2', 'none'),
    ],
    Tuesday: [
      REG,
      row('Spanish', 'APU', 'M3', 'etienne'),
      row('Spanish', 'APU', 'M3', 'etienne'),
      BREAK,
      row('History', 'HWH', 'S5', 'etienne'),
      row('History', 'HWH', 'S5', 'etienne'),
      row('Maths', 'AHE', 'P1', 'duncan'),
      row('Maths', 'AHE', 'P1', 'duncan'),
      LUNCH,
      REG,
      row('Geography', 'DBE', 'E2', 'etienne'),
      row('Geography', 'DBE', 'E2', 'etienne'),
      row('English', 'MHO', 'S7', 'duncan'),
    ],
    Wednesday: [
      REG,
      row('French', 'SGE', 'M2', 'none'),
      row('French', 'SGE', 'M2', 'none'),
      BREAK,
      row('Spanish', 'APU', 'M3', 'etienne'),
      row('Spanish', 'APU', 'M3', 'etienne'),
      row('Physics', 'WTP', 'PH1', 'etienne'),
      row('Physics', 'WTP', 'PH1', 'etienne'),
      LUNCH,
      REG,
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
    ],
    Thursday: [
      REG,
      row('Maths', 'AHE', 'P1', 'duncan'),
      row('Maths', 'AHE', 'P1', 'duncan'),
      BREAK,
      row('3D Design', 'NAS', '3D1', 'duncan'),
      row('3D Design', 'NAS', '3D1', 'duncan'),
      row('Chemistry', 'CPO', 'SC2', 'etienne'),
      row('Chemistry', 'CPO', 'SC2', 'etienne'),
      LUNCH,
      REG,
      row('Biology', 'HTI', 'CH', 'etienne'),
      row('Biology', 'HTI', 'CH', 'etienne'),
      row('RS', 'AHA', 'E1', 'etienne'),
    ],
    Friday: [
      REG,
      row('Maths', 'AHE', 'P1', 'duncan'),
      row('Maths', 'AHE', 'P1', 'duncan'),
      BREAK,
      row('Computing', 'JPH', 'IT1', 'duncan'),
      row('Computing', 'JPH', 'IT1', 'duncan'),
      row('English', 'MHO', 'S7', 'duncan'),
      row('English', 'MHO', 'S7', 'duncan'),
      LUNCH,
      REG,
      row('Performing Arts', 'ABY', 'HAL', 'duncan'),
      row('Performing Arts', 'ABY', 'HAL', 'duncan'),
      row('PSHE', 'SGE', 'M2', 'etienne'),
    ],
  },
  B: {
    Monday: [
      REG,
      row('Art', 'LUP', 'AR2', 'duncan'),
      row('Art', 'LUP', 'AR2', 'duncan'),
      BREAK,
      row('PE', 'JAL', 'Off Site', 'other'),
      row('PE', 'JAL', 'Off Site', 'other'),
      row('3D Design', 'NAS', 'D1', 'duncan'),
      row('3D Design', 'NAS', 'D1', 'duncan'),
      LUNCH,
      REG,
      row('English', 'MHO', 'S7', 'duncan'),
      row('Spanish', 'APU', 'Spanish Room', 'etienne'),
      row('Spanish', 'APU', 'Spanish Room', 'etienne'),
    ],
    Tuesday: [
      REG,
      row('Geography', 'DBE', 'M1', 'etienne'),
      row('Geography', 'DBE', 'M1', 'etienne'),
      BREAK,
      row('RS', 'AHA', 'MA3', 'etienne'),
      row('RS', 'AHA', 'MA3', 'etienne'),
      row('Drama', 'ABY', 'YMG', 'duncan'),
      row('Drama', 'ABY', 'YMG', 'duncan'),
      LUNCH,
      REG,
      row('History', 'HWH', 'S5', 'etienne'),
      row('History', 'HWH', 'S5', 'etienne'),
      row('Maths', 'AHE', 'P1', 'duncan'),
    ],
    Wednesday: [
      REG,
      row('French', 'SGE', 'M2', 'none'),
      row('French', 'SGE', 'M2', 'none'),
      BREAK,
      row('English', 'MHO', 'S5', 'duncan'),
      row('English', 'MHO', 'S5', 'duncan'),
      row('Art', 'LUP', 'AR2', 'duncan'),
      row('Art', 'LUP', 'AR2', 'duncan'),
      LUNCH,
      REG,
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
      row('Games', 'DHI', 'Off Site 4', 'duncan'),
    ],
    Thursday: [
      REG,
      row('Physics', 'WTP', 'PH1', 'etienne'),
      row('Physics', 'WTP', 'PH1', 'etienne'),
      BREAK,
      row('Maths', 'AHE', 'P1', 'duncan'),
      row('Maths', 'AHE', 'P1', 'duncan'),
      row('Chemistry', 'CPO', 'S1', 'etienne'),
      row('Chemistry', 'CPO', 'S1', 'etienne'),
      LUNCH,
      REG,
      row('Music', 'MCN', 'MU', 'duncan'),
      row('Music', 'MCN', 'MU', 'duncan'),
      row('English', 'MHO', 'S7', 'duncan'),
    ],
    Friday: [
      REG,
      row('Food Prep', 'NGA', 'HE', 'duncan'),
      row('Food Prep', 'NGA', 'HE', 'duncan'),
      BREAK,
      row('English', 'MHO', 'S7', 'duncan'),
      row('English', 'MHO', 'S7', 'duncan'),
      row('RS', 'AHA', 'E1', 'etienne'),
      row('RS', 'AHA', 'E1', 'etienne'),
      LUNCH,
      REG,
      row('Extra Curricular', 'TPA', 'Off Site 2', 'duncan'),
      row('Extra Curricular', 'TPA', 'Off Site 2', 'duncan'),
      row('Extra Curricular', 'TPA', 'Off Site 2', 'duncan'),
    ],
  },
}

export function mergedDay(week, day) {
  const slots = WEEKS[week][day]
  const merged = []
  slots.forEach((slot, i) => {
    const [start, end] = ROW_TIMES[i]
    const last = merged[merged.length - 1]
    if (
      last &&
      last.subject === slot.subject &&
      last.teacher === slot.teacher &&
      last.room === slot.room &&
      last.colour === slot.colour
    ) {
      last.end = end
    } else {
      merged.push({ ...slot, start, end })
    }
  })
  return merged
}

export const COLOUR_LABELS = {
  duncan: 'Duncan',
  etienne: 'Etienne',
  none: 'No one',
  other: 'Other',
}
