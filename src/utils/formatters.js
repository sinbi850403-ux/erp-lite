// 공통 숫자/통화 포맷터

/** 숫자를 한국 로케일 천단위 구분으로 반환 (₩ 없음) */
export const fmtNum = v => (parseFloat(v) || 0).toLocaleString('ko-KR');

/** 숫자를 ₩ 기호 포함 원화 문자열로 반환, 0/null이면 '-' */
export const fmtWon = v => v ? `₩${Math.round(parseFloat(v)).toLocaleString('ko-KR')}` : '-';
