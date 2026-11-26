/* =========================================================================
   도감 천체 — NASA·허블·제임스웹·탐사선 공개 사진 매칭표
   · 모든 파일은 assets/space/ 에 내려받아 두었습니다 (외부 의존 없이 표시).
   · 출처: NASA Image and Video Library (images-api.nasa.gov) 공개 이미지,
     M45는 Digitized Sky Survey 2 (NASA SkyView) 실제 하늘 사진.
   · keys: 도감에서 쓰는 이름·번호를 모두 적습니다. 매칭은 공백/기호를 지우고
     소문자로 비교합니다 (아래 photo-ui.js 의 norm 참고).
   ========================================================================= */
window.CATALOG_PHOTOS = [
  /* ------------------------------------------------ 태양계 */
  {
    file: 'sdo-sun-full-disk.jpg', title: '태양 전면 — SDO',
    mission: 'NASA SDO (Solar Dynamics Observatory)', date: '2025-09-15', credit: 'NASA/SDO',
    keys: ['태양', 'Sun', 'solar'], size: null
  },
  {
    file: 'moon-clementine.jpg', title: '달 앞면 — 클레멘타인 탐사선',
    mission: 'NASA 클레멘타인', date: '1998-06-04', credit: 'NASA/JPL/USGS', nasa: 'PIA00302',
    keys: ['달', 'Moon', 'luna', '지구의 달']
  },
  {
    file: 'mercury-messenger.jpg', title: '수성 전면 — 메신저',
    mission: 'NASA MESSENGER', date: '2011-12-01', credit: 'NASA/Johns Hopkins APL/Carnegie', nasa: 'PIA15162',
    keys: ['수성', 'Mercury']
  },
  {
    file: 'venus-magellan.jpg', title: '금성 전면 — 마젤란 레이더 지도',
    mission: 'NASA 마젤란', date: '1996-07-18', credit: 'NASA/JPL', nasa: 'PIA00252',
    keys: ['金星', '금성', 'Venus']
  },
  {
    file: 'epic-earth-185538.jpg', title: '지구 전면 — DSCOVR EPIC',
    mission: 'NOAA DSCOVR / NASA EPIC', date: '2026-11-23', credit: 'NASA/NOAA',
    keys: ['지구', 'Earth']
  },
  {
    file: 'mars-global-mgs.jpg', title: '화성 전면 — 화성 탐사선',
    mission: 'NASA Mars Global Surveyor', date: '2000-09-08', credit: 'NASA/JPL/MSSS', nasa: 'PIA02653',
    keys: ['화성', 'Mars']
  },
  {
    file: 'juno-crescent-jupiter.jpg', title: '초승달 모양 목성 — 주노',
    mission: 'NASA 주노', date: '2022-02-22', credit: 'NASA/JPL-Caltech/SwRI/MSSS', nasa: 'PIA25013',
    keys: ['목성', 'Jupiter']
  },
  {
    file: 'cassini-saturn-mosaic.jpg', title: '토성 모자이크 — 카시니',
    mission: 'NASA 카시니-하위헌스', date: '2017-07-24', credit: 'NASA/JPL-Caltech/Space Science Institute', nasa: 'PIA21617',
    keys: ['토성', 'Saturn']
  },
  {
    file: 'uranus-voyager2.jpg', title: '천왕성 — 보이저 2호',
    mission: 'NASA 보이저 2호', date: '1986', credit: 'NASA/JPL-Caltech', nasa: 'PIA18182',
    keys: ['천왕성', 'Uranus']
  },
  {
    file: 'neptune-voyager2.jpg', title: '해왕성 — 보이저 2호',
    mission: 'NASA 보이저 2호', date: '1989', credit: 'NASA/JPL', nasa: 'PIA01492',
    keys: ['해왕성', 'Neptune']
  },
  {
    file: 'pluto-new-horizons.jpg', title: '명왕성 — 뉴호라이즌스',
    mission: 'NASA 뉴호라이즌스', date: '2015-09-24', credit: 'NASA/JHU APL/SwRI', nasa: 'PIA19952',
    keys: ['명왕성', 'Pluto']
  },
  {
    file: 'ceres-dawn.jpg', title: '세레스 — 던 탐사선',
    mission: 'NASA 던(Dawn)', date: '2015', credit: 'NASA/JPL-Caltech/UCLA/MPS/DLR/IDA', nasa: 'PIA19167',
    keys: ['세레스', 'Ceres']
  },
  {
    file: 'io-galileo.jpg', title: '이오 — 갈릴레오',
    mission: 'NASA 갈릴레오', date: '1997', credit: 'NASA/JPL/University of Arizona', nasa: 'PIA02308',
    keys: ['이오', 'Io']
  },
  {
    file: 'europa-galileo.jpg', title: '유로파 — 갈릴레오',
    mission: 'NASA 갈릴레오', date: '2014', credit: 'NASA/JPL-Caltech/SETI Institute', nasa: 'PIA19048',
    keys: ['유로파', 'Europa']
  },
  {
    file: 'ganymede-galileo.jpg', title: '가니메데 — 갈릴레오',
    mission: 'NASA 갈릴레오', date: '2000', credit: 'NASA/JPL', nasa: 'PIA02278',
    keys: ['가니메데', 'Ganymede']
  },
  {
    file: 'callisto-galileo.jpg', title: '칼리스토 — 갈릴레오',
    mission: 'NASA 갈릴레오', date: '2001', credit: 'NASA/JPL/DLR', nasa: 'PIA03456',
    keys: ['칼리스토', 'Callisto']
  },
  {
    file: 'titan-cassini.jpg', title: '타이탄 — 카시니',
    mission: 'NASA 카시니-하위헌스', date: '2012', credit: 'NASA/JPL-Caltech/Space Science Institute', nasa: 'PIA14909',
    keys: ['타이탄', 'Titan']
  },
  {
    file: 'enceladus-cassini.jpg', title: '엔셀라두스 — 카시니',
    mission: 'NASA 카시니-하위헌스', date: '2015-10-30', credit: 'NASA/JPL-Caltech/Space Science Institute', nasa: 'PIA17202',
    keys: ['엔셀라두스', 'Enceladus']
  },
  {
    file: 'triton-voyager2.jpg', title: '트리톤 — 보이저 2호',
    mission: 'NASA 보이저 2호', date: '1989', credit: 'NASA/JPL', nasa: 'PIA01994',
    keys: ['트리톤', 'Triton']
  },

  /* ------------------------------------------------ 심우주 */
  {
    file: 'hubble-orion-nebula.jpg', title: '오리온 대성운과 충격파 — 허블',
    mission: '허블 우주망원경', date: '1999-12-02', credit: "NASA, C.R. O'Dell and S.K. Wong (Rice University)", nasa: 'PIA04227',
    keys: ['M42', 'NGC1976', '오리온 대성운', '오리온대성운', 'Orion Nebula', 'm42']
  },
  {
    file: 'hubble-andromeda-panorama.jpg', title: '안드로메다은하 파노라마 — 허블 PHAT',
    mission: '허블 우주망원경', date: '2017-12-08', credit: 'NASA, ESA, J. Dalcanton, B.F. Williams (Univ. of Washington)', nasa: 'GSFC_20171208_Archive_e000833',
    keys: ['M31', 'NGC224', '안드로메다 은하', '안드로메다은하', 'Andromeda', 'm31']
  },
  {
    file: 'hubble-pillars-of-creation.jpg', title: '창조의 기둥 — 독수리성운',
    mission: '허블 우주망원경', date: '1995 (2007 공개)', credit: 'NASA, ESA, STScI, J. Hester and P. Scowen (ASU)', nasa: 'PIA09109',
    keys: ['M16', 'NGC6611', '독수리성운', '독수리 성운', 'Eagle Nebula', 'm16']
  },
  {
    file: 'hubble-crab-nebula.jpg', title: '게성운 — 1054년 초신성 잔해',
    mission: '허블 우주망원경', date: '2005-12-01', credit: 'NASA, ESA, J. Hester and A. Loll (ASU)', nasa: 'PIA03606',
    keys: ['M1', 'NGC1952', '게성운', '게 성운', 'Crab Nebula', 'm1']
  },
  {
    file: 'jwst-carina-cosmic-cliffs.jpg', title: '우주 절벽 — 용골자리 성운',
    mission: '제임스 웹 우주망원경 (NIRCam)', date: '2022-07-12', credit: 'NASA, ESA, CSA, STScI', nasa: 'carina_nebula',
    keys: ['NGC3372', 'NGC3324', '용골자리 성운', '용골자리성운', 'Carina Nebula']
  },
  {
    file: 'm8-lagoon-core.jpg', title: '석호성운 중심부 — 허블',
    mission: '허블 우주망원경', date: '2018', credit: 'NASA/ESA/STScI', nasa: 'GSFC_20171208_Archive_e001955',
    keys: ['M8', 'NGC6523', '석호성운', '석호 성운', 'Lagoon Nebula', 'm8']
  },
  {
    file: 'm20-trifid-spitzer.jpg', title: '삼열성운 — 스피처 적외선',
    mission: 'NASA 스피처 우주망원경', date: '2011', credit: 'NASA/JPL-Caltech/UCLA', nasa: 'PIA17834',
    keys: ['M20', 'NGC6514', '삼열성운', '삼열 성운', 'Trifid Nebula', 'm20']
  },
  {
    file: 'm27-dumbbell.jpg', title: '아령성운 — 허블',
    mission: '허블 우주망원경', date: '2001', credit: 'NASA/JPL/STScI', nasa: 'PIA04249',
    keys: ['M27', 'NGC6853', '아령성운', '아령 성운', 'Dumbbell Nebula', 'm27']
  },
  {
    file: 'm57-ring-nebula.jpg', title: '고리성운 — 허블',
    mission: '허블 우주망원경', date: '2013', credit: 'NASA/JPL-Caltech/ESA, Hubble Heritage (STScI/AURA)', nasa: 'PIA14443',
    keys: ['M57', 'NGC6720', '고리성운', '고리 성운', 'Ring Nebula', 'm57']
  },
  {
    file: 'm13-hercules-hubble.jpg', title: '헤르쿨레스 구상성단 — 허블',
    mission: '허블 우주망원경', date: '2015', credit: 'NASA/ESA/STScI', nasa: 'GSFC_20171208_Archive_e001116',
    keys: ['M13', 'NGC6205', '헤르쿨레스 구상성단', '헤르쿨레스구상성단', 'Hercules Cluster', 'm13']
  },
  {
    file: 'm11-wild-duck.jpg', title: '야생오리 성단 — 허블',
    mission: '허블 우주망원경', date: '2004', credit: 'NASA/JPL', nasa: 'PIA07878',
    keys: ['M11', 'NGC6705', '야생오리성단', '야생오리 성단', 'Wild Duck Cluster', 'm11']
  },
  {
    file: 'm45-pleiades-dss.jpg', title: '플레이아데스 성단 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', nasa: null, survey: true,
    keys: ['M45', '플레이아데스', '플레이아데스 성단', '좀생이별', 'Pleiades', 'm45']
  },
  {
    file: 'm33-triangulum-ir.jpg', title: '삼각형자리 은하 — 적외선 합성',
    mission: '허셜·플랑크·IRAS·COBE 합성', date: '2019', credit: 'ESA/NASA/JPL-Caltech/GBT/VLA/IRAM/C. Clark (STScI)', nasa: 'PIA25165',
    keys: ['M33', 'NGC598', '삼각형자리 은하', '삼각형자리은하', 'Triangulum', 'm33']
  },
  {
    file: 'm51-whirlpool.jpg', title: '소용돌이 은하 — 전 파장 합성',
    mission: '찬드라 · GALEX · 허블 · 스피처 합성', date: '2007', credit: 'NASA/CXC, NASA/JPL-Caltech, NASA/ESA/STScI', nasa: 'PIA10200',
    keys: ['M51', 'NGC5194', '소용돌이 은하', '소용돌이은하', 'Whirlpool', 'm51']
  },
  {
    file: 'm81-bode.jpg', title: '보데 은하 — 적외선',
    mission: '스피처 · GALEX', date: '2007', credit: 'NASA/JPL-Caltech/ESA/Harvard-Smithsonian CfA', nasa: 'PIA09579',
    keys: ['M81', 'NGC3031', '보데 은하', '보데은하', 'Bode', 'm81']
  },
  {
    file: 'm82-cigar.jpg', title: '시가 은하 — 허블',
    mission: '허블 우주망원경', date: '2006', credit: 'NASA, ESA, R. de Grijs (Cambridge)', nasa: 'PIA04218',
    keys: ['M82', 'NGC3034', '시가 은하', '시가은하', 'Cigar', 'm82']
  },
  {
    file: 'm104-sombrero.jpg', title: '솜브레로 은하 — 허블',
    mission: '허블 우주망원경', date: '2011', credit: 'NASA/STScI/AURA', nasa: 'PIA15226',
    keys: ['M104', 'NGC4594', '솜브레로 은하', '솜브레로은하', 'Sombrero', 'm104']
  },
  {
    file: 'ngc7000-north-america.jpg', title: '북아메리카 성운 — 적외선',
    mission: 'NASA 스피처 우주망원경', date: '2011', credit: 'NASA/JPL-Caltech', nasa: 'PIA13843',
    keys: ['NGC7000', '북아메리카 성운', '북아메리카성운', 'North America Nebula']
  },

  /* ------------------------- 실제 하늘 탐사 사진(DSS2) 미리 받아 둔 항목 */
  {
    file: 'm35-cluster-dss.jpg', title: '쌍둥이자리 산개성단 M35 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['M35', 'NGC2168', '쌍둥이자리 산개성단', '쌍둥이자리산개성단']
  },
  {
    file: 'm44-beehive-dss.jpg', title: '벌집성단 M44 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['M44', 'NGC2632', '벌집성단', '벌집 성단', 'Praesepe', 'Beehive']
  },
  {
    file: 'm15-pegasus-dss.jpg', title: '페가수스 구상성단 M15 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['M15', 'NGC7078', '페가수스 구상성단', '페가수스구상성단']
  },
  {
    file: 'betelgeuse-dss.jpg', title: '베텔게우스 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['베텔게우스', 'Betelgeuse', 'α Orionis', '알파 오리오니스']
  },
  {
    file: 'rigel-dss.jpg', title: '리겔 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['리겔', 'Rigel', 'β Orionis']
  },
  {
    file: 'sirius-dss.jpg', title: '시리우스 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['시리우스', 'Sirius', 'α Canis Majoris']
  },
  {
    file: 'aldebaran-dss.jpg', title: '알데바란 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['알데바란', 'Aldebaran', 'α Tauri']
  },
  {
    file: 'regulus-dss.jpg', title: '레굴루스 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['레굴루스', 'Regulus', 'α Leonis']
  },
  {
    file: 'vega-dss.jpg', title: '베가 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['베가', 'Vega', 'α Lyrae', '직녀성']
  },
  {
    file: 'deneb-dss.jpg', title: '데네브 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['데네브', 'Deneb', 'α Cygni']
  },
  {
    file: 'altair-dss.jpg', title: '알타이르 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['알타이르', 'Altair', 'α Aquilae', '견우성']
  },
  {
    file: 'albireo-dss.jpg', title: '알비레오 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['알비레오', 'Albireo', 'β Cygni']
  },
  {
    file: 'proxima-dss.jpg', title: '프록시마 센타우리 — 실제 하늘 사진 (DSS2)',
    mission: 'Digitized Sky Survey 2 · NASA SkyView', date: '—', credit: 'DSS2 (NASA/ESA/STScI)', survey: true,
    keys: ['프록시마 센타우리', '프록시마', 'Proxima Centauri', 'Proxima']
  }
];
