// 下部に固定したスクロールバーを画像行と同期させる

// 慣性とイージングを使ったスムーズスクロール
class SmoothScroll {
  constructor(element) {
    this.element = element;
    this.targetScroll = element.scrollLeft;
    this.currentScroll = element.scrollLeft;
    this.ease = 0.15; // イージング係数（小さいほど滑らかだが遅い）
    this.isScrolling = false;
    this.rafId = null;
  }

  addMomentum(delta) {
    // 目標スクロールに慣性を加えつつ範囲を制限
    this.targetScroll += delta;
    const maxScroll = this.element.scrollWidth - this.element.clientWidth;
    this.targetScroll = Math.max(0, Math.min(this.targetScroll, maxScroll));
    
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.animate();
    }
  }

  animate() {
    // イージングによる滑らかな補間
    const diff = this.targetScroll - this.currentScroll;
    
    // 差分がごく小さい場合は目標にスナップ
    if (Math.abs(diff) < 0.1) {
      this.currentScroll = this.targetScroll;
      this.element.scrollLeft = this.currentScroll;
      this.isScrolling = false;
      return;
    }
    
    // イージングを適用
    this.currentScroll += diff * this.ease;
    this.element.scrollLeft = this.currentScroll;
    
    // アニメーションを継続
    this.rafId = requestAnimationFrame(() => this.animate());
  }

  syncTo(scrollLeft) {
    this.targetScroll = scrollLeft;
    this.currentScroll = scrollLeft;
    this.element.scrollLeft = scrollLeft;
  }

  update(scrollLeft) {
    this.targetScroll = scrollLeft;
    if (!this.isScrolling) {
      this.isScrolling = true;
      this.animate();
    }
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isScrolling = false;
  }
}

const imageRow = document.getElementById('image-row');
const proxy = document.getElementById('scrollbar-proxy');
const proxyInner = document.getElementById('scrollbar-inner');

let smoothScrollInstance = null;

if (imageRow && proxy && proxyInner) {
  smoothScrollInstance = new SmoothScroll(imageRow);

  // 代理スクロールの幅を、最も広い行（メインか2段目）に合わせる
  function updateProxyWidth() {
    const secondRow = document.getElementById('image-row-second');
    const mainWidth = imageRow.scrollWidth;
    const secondWidth = secondRow ? secondRow.scrollWidth : 0;
    const maxWidth = Math.max(mainWidth, secondWidth);
    proxyInner.style.width = maxWidth + 'px';
  }

  // フィードバックループを避けるための同期フラグ
  let syncingFromImage = false;
  let syncingFromProxy = false;

  imageRow.addEventListener('scroll', () => {
    if (syncingFromProxy) return;
    syncingFromImage = true;
    proxy.scrollLeft = imageRow.scrollLeft;
    syncingFromImage = false;
  }, { passive: true });

  proxy.addEventListener('scroll', () => {
    if (syncingFromImage) return;
    syncingFromProxy = true;
    smoothScrollInstance.syncTo(proxy.scrollLeft);
    syncingFromProxy = false;
  }, { passive: true });

  // 画像読み込みやリサイズ時に代理幅を更新
  function onResizeOrLoad() {
    updateProxyWidth();
    proxy.scrollLeft = imageRow.scrollLeft;
  }

  window.addEventListener('resize', onResizeOrLoad);
  window.addEventListener('load', onResizeOrLoad);

  // 各画像の読み込み完了でも更新
  const imgs = imageRow.querySelectorAll('img');
  imgs.forEach(img => img.addEventListener('load', updateProxyWidth));

  // 垂直ホイールで画像行を水平スクロールできるようにする（慣性付き）
  imageRow.addEventListener('wheel', (e) => {
    // 水平スクロールが主体なら干渉しない
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // ライトボックス開放中は処理しない
    if (document.querySelector('.lightbox.open')) return;
    e.preventDefault();
    smoothScrollInstance.addMomentum(e.deltaY * 1.8); // 速度を上げるため感度を強める
  }, { passive: false });

  // --- グローバルホイール: 必要に応じて縦スクロールを画像行の横スクロールへ変換
  // ポインタが画像行や代理バー上にいなくてもホイールで画像を送れるようにする
  document.addEventListener('wheel', (e) => {
    // 水平イベントが優勢なら無視
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // ライトボックス開放中は無視
    if (document.querySelector('.lightbox.open')) return;

    // 画像行や代理バー内なら各ハンドラに任せて二重処理を避ける
    if (e.target.closest && (e.target.closest('.image-row') || e.target.closest('.scrollbar-proxy'))) {
      return;
    }

    // 横方向にオーバーフローがある場合のみ変換
    if (imageRow.scrollWidth <= imageRow.clientWidth) return;

    // ページの縦スクロールを抑止し、縦の量を横へ割り当てる
    e.preventDefault();
    smoothScrollInstance.addMomentum(e.deltaY * 1.8);
  }, { passive: false });

  // 初期設定
  updateProxyWidth();
}

// --- 上段(img27)をメイン行と同期し、位置を合わせる ---
const imageRowTop = document.getElementById('image-row-top');
const imageRowSecond = document.getElementById('image-row-second');

// パララックス用のスムーズスクロールインスタンス
let smoothScrollTop = null;
let smoothScrollSecond = null;

if (imageRowTop) smoothScrollTop = new SmoothScroll(imageRowTop);
if (imageRowSecond) smoothScrollSecond = new SmoothScroll(imageRowSecond);

// フィードバックループを避けるためのグローバルフラグ
let syncingToTop = false;
let syncingFromTop = false;
let syncingToSecond = false;
let syncingFromSecond = false;

if (imageRow && imageRowTop) {
  // メイン→上段の一方向同期は後段の統合リスナーで処理

  // 先頭と末尾の位置を合わせ、均等にギャップを配る
  function alignImageRows() {
    const mainImages = imageRow.querySelectorAll('img');
    const topImages = imageRowTop.querySelectorAll('img');
    
    if (mainImages.length === 0 || topImages.length === 0) return;

    // 画像の読み込み完了を待つ
    const allImages = [...mainImages, ...topImages];
    Promise.all(allImages.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => img.addEventListener('load', resolve));
    })).then(() => {
      // メイン行の先頭と末尾の境界を取得
      const firstMain = mainImages[0];
      const lastMain = mainImages[mainImages.length - 1];
      
      const firstMainRect = firstMain.getBoundingClientRect();
      const lastMainRect = lastMain.getBoundingClientRect();
      
      // メイン行の先頭から末尾までの全幅
      const mainSpan = lastMainRect.right - firstMainRect.left;
      
      // 上段画像の合計幅
      let topImagesWidth = 0;
      topImages.forEach(img => {
        topImagesWidth += img.offsetWidth;
      });
      
      // 同じスパンに収まるよう必要なギャップを計算
      const topImageCount = topImages.length;
      const totalGap = mainSpan - topImagesWidth;
      const gapPerImage = totalGap / (topImageCount - 1);
      
      imageRowTop.style.gap = Math.max(0, gapPerImage) + 'px';
    });
  }

  // ロード時とリサイズ時に整列
  window.addEventListener('load', alignImageRows);
  window.addEventListener('resize', alignImageRows);
  setTimeout(alignImageRows, 100);
}

// --- img1.pngクリックでYouTubeリンクを開く ---
const img1 = document.querySelector('img[src="img/img1.png"]');
if (img1) {
  img1.style.cursor = 'pointer';
  img1.addEventListener('click', () => {
    window.open('https://youtu.be/8HgRa3zzOAE?si=waZL4IU_nM6SUMaf', '_blank');
  });
}

// --- パララックス用の統合スクロールハンドラ（背景と前景を1つで更新） ---
let syncingFromProxySecond = false;
let rafParallax = null; // すべてのパララックス更新をまとめる1本のRAF

if (imageRow && (imageRowTop || imageRowSecond)) {
  // メイン行のスクロールを起点に全パララックス層を滑らかに同期
  imageRow.addEventListener('scroll', () => {
    if (syncingFromTop || syncingFromSecond || syncingFromProxySecond) return;
    
    // 前のフレームが残っていればキャンセル
    if (rafParallax) {
      cancelAnimationFrame(rafParallax);
    }
    
    rafParallax = requestAnimationFrame(() => {
      const imageRowMaxScroll = imageRow.scrollWidth - imageRow.clientWidth;
      
      if (imageRowMaxScroll > 0) {
        const mainScrollRatio = imageRow.scrollLeft / imageRowMaxScroll;
        
        // 背景レイヤーを0.3倍速で更新
        if (imageRowTop) {
          syncingToTop = true;
          const maxScrollTop = imageRowTop.scrollWidth - imageRowTop.clientWidth;
          if (maxScrollTop > 0) {
            const targetScroll = mainScrollRatio * maxScrollTop * 0.3;
            const clampedScroll = Math.max(0, Math.min(targetScroll, maxScrollTop));
            if (smoothScrollTop) {
              smoothScrollTop.update(clampedScroll);
            } else {
              imageRowTop.scrollLeft = clampedScroll;
            }
          }
          syncingToTop = false;
        }
        
        // 前景レイヤーを1.3倍速で更新
        if (imageRowSecond) {
          syncingToSecond = true;
          const maxScrollSecond = imageRowSecond.scrollWidth - imageRowSecond.clientWidth;
          if (maxScrollSecond > 0) {
            const targetScroll = mainScrollRatio * maxScrollSecond * 1.3;
            const clampedScroll = Math.max(0, Math.min(targetScroll, maxScrollSecond));
            if (smoothScrollSecond) {
              smoothScrollSecond.update(clampedScroll);
            } else {
              imageRowSecond.scrollLeft = clampedScroll;
            }
          }
          syncingToSecond = false;
        }
      }
      
      rafParallax = null;
    });
  }, { passive: true });
}

if (imageRowSecond) {

  imageRowSecond.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (document.querySelector('.lightbox.open')) return;
    e.preventDefault();
    if (smoothScrollSecond) {
      smoothScrollSecond.addMomentum(e.deltaY * 1.8);
    }
  }, { passive: false });

  // 2段目のimg21クリックで拡大表示
  const img21 = imageRowSecond.querySelector('img[alt="img21"]');
  if (img21) {
    img21.style.cursor = 'pointer';
    img21.addEventListener('click', () => {
      openLightbox('img/img21-1.png');
    });
  }

  const img22 = imageRowSecond.querySelector('img[alt="img22"]');
  if (img22) {
    img22.style.cursor = 'pointer';
    img22.addEventListener('click', () => {
      openLightbox('img/img22-1.png');
    });
  }

  const img23 = imageRowSecond.querySelector('img[alt="img23"]');
  const img24 = imageRowSecond.querySelector('img[alt="img24"]');

  if (img23) {
    img23.style.cursor = 'pointer';
    img23.addEventListener('click', () => {
      openLightbox('img/img23-1.png');
    });
    // img23とimg24のホバーを連動させる
    img23.addEventListener('mouseenter', () => {
      img23.classList.add('hovered-group');
      if (img24) img24.classList.add('hovered-group');
    });
    img23.addEventListener('mouseleave', () => {
      img23.classList.remove('hovered-group');
      if (img24) img24.classList.remove('hovered-group');
    });
  }

  if (img24) {
    img24.style.cursor = 'pointer';
    img24.addEventListener('click', () => {
      openLightbox('img/img23-1.png');
    });
    // img23とimg24のホバーを連動させる
    img24.addEventListener('mouseenter', () => {
      if (img23) img23.classList.add('hovered-group');
      img24.classList.add('hovered-group');
    });
    img24.addEventListener('mouseleave', () => {
      if (img23) img23.classList.remove('hovered-group');
      img24.classList.remove('hovered-group');
    });
  }

  const img25 = imageRowSecond.querySelector('img[alt="img25"]');
  if (img25) {
    img25.style.cursor = 'pointer';
    img25.addEventListener('click', () => {
      openLightbox('img/img25-1.png');
    });
  }

  const img26 = imageRowSecond.querySelector('img[alt="img26"]');
  if (img26) {
    img26.style.cursor = 'pointer';
    img26.addEventListener('click', () => {
      openLightbox('img/img26-1.png');
    });
  }
}

// --- img1系のライトボックス: img1-1を80%で表示し戻るボタンを付ける ---
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxBackdrop = document.getElementById('lightbox-backdrop');

function openLightbox(src) {
  if (!lightbox) return;
  lightboxImg.src = src;
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

if (imageRow) {
  const img2 = imageRow.querySelector('img[alt="img2"]');
  if (img2) {
    img2.style.cursor = 'pointer';
    img2.addEventListener('click', () => {
      openLightbox('img/img2-1.png');
    });
  }

  const img3 = imageRow.querySelector('img[alt="img3"]');
  if (img3) {
    img3.style.cursor = 'pointer';
    img3.addEventListener('click', () => {
      openLightbox('img/img3-1.png');
    });
  }

  const img4 = imageRow.querySelector('img[alt="img4"]');
  if (img4) {
    img4.style.cursor = 'pointer';
    img4.addEventListener('click', () => {
      openLightbox('img/img4-1.png');
    });
  }

  const img5 = imageRow.querySelector('img[alt="img5"]');
  if (img5) {
    img5.style.cursor = 'pointer';
    img5.addEventListener('click', () => {
      openLightbox('img/img5-1.png');
    });
  }

  const img6 = imageRow.querySelector('img[alt="img6"]');
  if (img6) {
    img6.style.cursor = 'pointer';
    img6.addEventListener('click', () => {
      openLightbox('img/img6-1.png');
    });
  }

  const img7 = imageRow.querySelector('img[alt="img7"]');
  if (img7) {
    img7.style.cursor = 'pointer';
    img7.addEventListener('click', () => {
      openLightbox('img/img7-1.png');
    });
  }

  const img8 = imageRow.querySelector('img[alt="img8"]');
  if (img8) {
    img8.style.cursor = 'pointer';
    img8.addEventListener('click', () => {
      openLightbox('img/img8-1.png');
    });
  }

  const img9 = imageRow.querySelector('img[alt="img9"]');
  if (img9) {
    img9.style.cursor = 'pointer';
    img9.addEventListener('click', () => {
      openLightbox('img/img9-1.png');
    });
  }

  const img10 = imageRow.querySelector('img[alt="img10"]');
  if (img10) {
    img10.style.cursor = 'pointer';
    img10.addEventListener('click', () => {
      openLightbox('img/img10-1.png');
    });
  }

  const img11 = imageRow.querySelector('img[alt="img11"]');
  if (img11) {
    img11.style.cursor = 'pointer';
    img11.addEventListener('click', () => {
      openLightbox('img/img11-1.png');
    });
  }

  const img12 = imageRow.querySelector('img[alt="img12"]');
  if (img12) {
    img12.style.cursor = 'pointer';
    img12.addEventListener('click', () => {
      openLightbox('img/img12-1.png');
    });
  }

  const img13 = imageRow.querySelector('img[alt="img13"]');
  if (img13) {
    img13.style.cursor = 'pointer';
    img13.addEventListener('click', () => {
      openLightbox('img/img13-1.png');
    });
  }

  const img14 = imageRow.querySelector('img[alt="img14"]');
  if (img14) {
    img14.style.cursor = 'pointer';
    img14.addEventListener('click', () => {
      openLightbox('img/img14-1.png');
    });
  }

  const img15 = imageRow.querySelector('img[alt="img15"]');
  if (img15) {
    img15.style.cursor = 'pointer';
    img15.addEventListener('click', () => {
      openLightbox('img/img15-1.png');
    });
  }

  const img16 = imageRow.querySelector('img[alt="img16"]');
  if (img16) {
    img16.style.cursor = 'pointer';
    img16.addEventListener('click', () => {
      openLightbox('img/img16-1.png');
    });
  }

  const img17 = imageRow.querySelector('img[alt="img17"]');
  if (img17) {
    img17.style.cursor = 'pointer';
    img17.addEventListener('click', () => {
      openLightbox('img/img17-1.png');
    });
  }

  const img18 = imageRow.querySelector('img[alt="img18"]');
  if (img18) {
    img18.style.cursor = 'pointer';
    img18.addEventListener('click', () => {
      openLightbox('img/img18-1.png');
    });
  }

  const img19 = imageRow.querySelector('img[alt="img19"]');
  if (img19) {
    img19.style.cursor = 'pointer';
    img19.addEventListener('click', () => {
      openLightbox('img/img19-1.png');
    });
  }

  const img20 = imageRow.querySelector('img[alt="img20"]');
  if (img20) {
    img20.style.cursor = 'pointer';
    img20.addEventListener('click', () => {
      openLightbox('img/img20-1.png');
    });
  }
}

if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
// Escapeキーでも閉じる
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });