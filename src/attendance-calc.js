/**
 * attendance-calc.js - 근태 집계 및 분류
 *
 * 역할: 일별 근태 데이터 → 월별 집계 (야간/연장/휴일 분류)
 * 왜 분리? → 근태 집계는 복잡하고 자주 변경됨 (정책 추가 등)
 *         → 급여 계산과 독립적으로 테스트/수정 가능
 *
 * 근무시간 분류:
 * - 정상: 08:00 ~ 18:00 (휴식 1시간) → 실 8시간
 * - 연장: 8시간 초과분
 * - 야간: 22:00 ~ 06:00 (2.0배 급여)
 * - 휴일: 주말/공휴일 (1.5배 급여)
 * - 지각: 09:00 이후 입실
 * - 결근: 기록 없음
 */

/**
 * 두 시간 사이의 분(minute) 계산
 * @param {string} startTime - "HH:MM" 형식
 * @param {string} endTime - "HH:MM" 형식 (다음날 가능, 예: "06:00" for 22:00~06:00)
 * @param {boolean} nextDay - endTime이 다음날인지 여부
 * @returns {number} 분 단위
 */
export function calcMinutesBetween(startTime, endTime, nextDay = false) {
  if (!startTime || !endTime) return 0;

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let start = parseTime(startTime);
  let end = parseTime(endTime);

  if (nextDay || end < start) {
    end += 24 * 60; // 다음날
  }

  return Math.max(0, end - start);
}

/**
 * 일별 근무시간 분류
 * 입력: 출퇴근 시간, 휴식시간
 * 출력: 정상근무, 연장, 야간, 휴일 시간 분류
 *
 * @param {object} attendance - {check_in, check_out, break_min, status, is_holiday}
 * @returns {object} {work_min, overtime_min, night_min, holiday_min, status_code}
 */
export function classifyWorkMinutes(attendance = {}) {
  const {
    check_in = null,
    check_out = null,
    break_min = 0,
    status = '정상',
    is_holiday = false,
  } = attendance;

  const result = {
    work_min: 0,
    overtime_min: 0,
    night_min: 0,
    holiday_min: 0,
    status_code: 'normal',
  };

  // 상태 코드 매핑
  if (status === '결근') {
    result.status_code = 'absent';
    return result;
  }
  if (status === '지각') {
    result.status_code = 'late';
  }
  if (status === '조퇴') {
    result.status_code = 'early_leave';
  }
  if (status === '휴가') {
    result.status_code = 'leave';
    return result;
  }

  if (!check_in || !check_out) {
    return result;
  }

  // 전체 근무시간 (분)
  const totalMin = calcMinutesBetween(check_in, check_out, check_out < check_in);
  const netWorkMin = Math.max(0, totalMin - break_min);

  if (is_holiday) {
    // 휴일 근무: 모두 휴일급으로 분류
    result.holiday_min = netWorkMin;
    result.status_code = 'holiday';
    return result;
  }

  // 야간 시간 분류 (22:00 ~ 06:00)
  const NIGHT_START = 22 * 60; // 1320분
  const NIGHT_END = 6 * 60;    // 360분

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let inMin = parseTime(check_in);
  let outMin = parseTime(check_out);

  // 자정을 넘는 경우 처리
  if (outMin < inMin) {
    outMin += 24 * 60;
  }

  // 야간 구간 계산
  let nightMin = 0;

  if (inMin < NIGHT_END) {
    // 오전(~06:00)에 입장한 경우
    nightMin = Math.max(0, Math.min(outMin, NIGHT_END + 24 * 60) - inMin);
  } else if (inMin >= NIGHT_START) {
    // 22:00 이후 입장 → 전부 야간
    nightMin = outMin - inMin;
  } else if (outMin > NIGHT_START) {
    // 일반시간에 입장, 22:00 이후 퇴장
    nightMin = outMin - NIGHT_START;
  }

  result.night_min = Math.max(0, nightMin);

  // 일반 근무 시간 = 전체 - 야간
  const regularMin = netWorkMin - result.night_min;

  // 연장 근무: 8시간 초과분
  const STANDARD_HOURS = 8 * 60; // 480분
  if (regularMin > STANDARD_HOURS) {
    result.work_min = STANDARD_HOURS;
    result.overtime_min = regularMin - STANDARD_HOURS;
  } else {
    result.work_min = regularMin;
    result.overtime_min = 0;
  }

  return result;
}

/**
 * 월별 근태 집계
 * @param {array} attendanceList - [{work_date, check_in, check_out, break_min, status, is_holiday}]
 * @returns {object} 월별 집계 통계
 */
export function summarizeMonthAttendance(attendanceList = []) {
  let totalWorkMin = 0;
  let totalOvertimeMin = 0;
  let totalNightMin = 0;
  let totalHolidayMin = 0;
  let workDays = 0;
  let absence = 0;
  let late = 0;
  let earlyLeave = 0;
  let leaveDay = 0;

  const classifications = {
    normal: 0,
    late: 0,
    absent: 0,
    early_leave: 0,
    leave: 0,
    holiday: 0,
  };

  attendanceList.forEach((att) => {
    const classified = classifyWorkMinutes(att);

    totalWorkMin += classified.work_min;
    totalOvertimeMin += classified.overtime_min;
    totalNightMin += classified.night_min;
    totalHolidayMin += classified.holiday_min;

    classifications[classified.status_code]++;

    switch (classified.status_code) {
      case 'normal':
        workDays++;
        break;
      case 'late':
        late++;
        workDays++;
        break;
      case 'absent':
        absence++;
        break;
      case 'early_leave':
        earlyLeave++;
        workDays++;
        break;
      case 'leave':
        leaveDay++;
        break;
      case 'holiday':
        // 휴일 근무는 근무일수에 포함되지 않음 (별도 급여)
        break;
    }
  });

  return {
    // 시간 통계
    total_work_min: totalWorkMin,
    total_work_hours: Math.round(totalWorkMin / 60 * 10) / 10,
    total_overtime_min: totalOvertimeMin,
    total_overtime_hours: Math.round(totalOvertimeMin / 60 * 10) / 10,
    total_night_min: totalNightMin,
    total_night_hours: Math.round(totalNightMin / 60 * 10) / 10,
    total_holiday_min: totalHolidayMin,
    total_holiday_hours: Math.round(totalHolidayMin / 60 * 10) / 10,

    // 일수 통계
    total_days: attendanceList.length,
    work_days: workDays,
    absence_days: absence,
    late_days: late,
    early_leave_days: earlyLeave,
    leave_days: leaveDay,

    // 상세 분류
    classifications,

    // 급여 기본 정보
    standard_hours_met: totalWorkMin >= 8 * 60 * workDays, // 1일 8시간 달성 여부
    has_overtime: totalOvertimeMin > 0,
    has_night_work: totalNightMin > 0,
    has_holiday_work: totalHolidayMin > 0,
  };
}

/**
 * 공휴일 판단
 * @param {string} dateStr - "YYYY-MM-DD" 형식
 * @returns {boolean} 공휴일 여부
 */
export function isPublicHoliday(dateStr) {
  // 2025년 대한민국 공휴일 (일부)
  const publicHolidays = [
    '2025-01-01', // 신정
    '2025-01-29', // 설날 (전날)
    '2025-01-30', // 설날
    '2025-01-31', // 설날 (다음날)
    '2025-03-01', // 독립운동일
    '2025-04-10', // 국회의원선거일
    '2025-05-05', // 어린이날
    '2025-05-15', // 부처님오신날
    '2025-06-06', // 현충일
    '2025-08-15', // 광복절
    '2025-09-16', // 추석 (전날)
    '2025-09-17', // 추석
    '2025-09-18', // 추석 (다음날)
    '2025-10-03', // 개천절
    '2025-10-09', // 한글날
    '2025-12-25', // 크리스마스
  ];

  return publicHolidays.includes(dateStr);
}

/**
 * 요일 판단
 * @param {string} dateStr - "YYYY-MM-DD" 형식
 * @returns {number} 0=일, 1=월, ..., 6=토
 */
export function getDayOfWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCDay();
}

/**
 * 휴일인지 판단 (주말 또는 공휴일)
 * @param {string} dateStr - "YYYY-MM-DD" 형식
 * @returns {boolean} 휴일 여부
 */
export function isWeekendOrPublicHoliday(dateStr) {
  const dayOfWeek = getDayOfWeek(dateStr);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 일요일 또는 토요일
  return isWeekend || isPublicHoliday(dateStr);
}

/**
 * 월별 근무일수 기준값 (공휴일 제외)
 * @param {number} year - 연도
 * @param {number} month - 월 (1-12)
 * @returns {number} 근무일수 (기준)
 */
export function getExpectedWorkDays(year, month) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const daysInMonth = lastDay.getUTCDate();

  let expectedDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isWeekendOrPublicHoliday(dateStr)) {
      expectedDays++;
    }
  }

  return expectedDays;
}

/**
 * 분을 시간으로 변환 (소수점 1자리)
 * @param {number} minutes - 분 단위
 * @returns {string} 시간 (예: "1.5")
 */
export function minToHours(minutes) {
  if (!minutes) return '0';
  return (Math.round((minutes / 60) * 10) / 10).toFixed(1);
}

/**
 * 월별 근태 집계 (카멜케이스 버전 - page-attendance.js 호환성)
 * @param {array} attendanceList - 근태 기록 배열
 * @returns {object} 카멜케이스 집계 결과
 */
export function summarizeMonth(attendanceList) {
  const result = summarizeMonthAttendance(attendanceList);
  return {
    days: result.work_days,
    totalDays: result.total_days,
    totalMin: result.total_work_min,
    overtimeMin: result.total_overtime_min,
    nightMin: result.total_night_min,
    holidayMin: result.total_holiday_min,
    absentDays: result.absence_days,
    lateDays: result.late_days,
    earlyLeaveDays: result.early_leave_days,
    leaveDays: result.leave_days,
  };
}
