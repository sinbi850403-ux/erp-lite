/**
 * pdf-font.js - jsPDF 한글 폰트 지원
 * 역할: Noto Sans KR 폰트를 로드하고 jsPDF에 등록
 * 왜 필요? → jsPDF 기본 폰트(Helvetica)는 한글 미지원 → 글자 깨짐
 * 
 * 폰트 파일: public/fonts/NotoSansKR-Regular.ttf
 * 왜 로컬? → CDN 의존성 제거, 오프라인에서도 동작, 안정성 보장
 */

// 폰트 캐시 (한 번만 로드)
let fontCache = null;

/**
 * 로컬 TTF 파일을 가져와 base64로 변환
 * 왜 런타임 로딩? → 폰트 파일(~10MB)을 번들에 포함하면 초기 로딩이 느려지므로
 *                  PDF 생성 시점에만 한 번 로드하고 이후 캐시 사용
 */
async function loadKoreanFont() {
  if (fontCache) return fontCache;

  try {
    // public 폴더의 폰트 파일 가져오기 (Vite에서 자동 서빙)
    const res = await fetch('/fonts/NotoSansKR-Regular.ttf');
    if (!res.ok) {
      throw new Error(`폰트 파일 로드 실패: ${res.status}`);
    }
    
    const arrayBuffer = await res.arrayBuffer();

    // ArrayBuffer → Base64 변환 (청크 단위로 처리하여 콜스택 오버플로우 방지)
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    fontCache = btoa(binary);
    return fontCache;
  } catch (err) {
    console.error('한글 폰트 로딩 실패:', err);
    return null;
  }
}

/**
 * jsPDF 문서에 한글 폰트 등록 및 설정
 * @param {jsPDF} doc - jsPDF 인스턴스
 * @returns {boolean} 성공 여부
 */
export async function applyKoreanFont(doc) {
  const fontBase64 = await loadKoreanFont();
  
  if (!fontBase64) {
    console.warn('한글 폰트 로딩 실패 — 기본 폰트로 PDF 생성');
    return false;
  }

  // jsPDF VFS에 폰트 파일 등록
  doc.addFileToVFS('NotoSansKR-Regular.ttf', fontBase64);
  doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
  doc.setFont('NotoSansKR');
  
  return true;
}

/**
 * autoTable용 한글 폰트 스타일 반환
 */
export function getKoreanFontStyle() {
  return {
    font: 'NotoSansKR',
  };
}
