import { IS_CAPACITOR, IS_TELEGRAM_APP } from '../config';
import { requestMeasure, requestMutation } from '../lib/fasterdom/fasterdom';
import { applyStyles } from './animation';
import { SECOND } from './dateFormat';
import safeExec from './safeExec';
import { throttle } from './schedulers';
import { IS_ANDROID, IS_IOS } from './windowEnvironment';

const WINDOW_RESIZE_THROTTLE_MS = IS_TELEGRAM_APP ? 25 : 250;
const WINDOW_ORIENTATION_CHANGE_THROTTLE_MS = IS_IOS ? 350 : 250;
const SAFE_AREA_INITIALIZATION_DELAY = SECOND;
const SAFE_AREA_TOLERANCE_HEIGHT_PX = 40;

const initialHeight = window.innerHeight;
const virtualKeyboardOpenListeners: NoneToVoidFunction[] = [];

let currentWindowSize = updateSizes();

window.addEventListener('orientationchange', throttle(() => {
  currentWindowSize = updateSizes();
}, WINDOW_ORIENTATION_CHANGE_THROTTLE_MS, false));

if (!IS_IOS) {
  window.addEventListener('resize', throttle(() => {
    currentWindowSize = updateSizes();
  }, WINDOW_RESIZE_THROTTLE_MS, true));
}

if (IS_CAPACITOR) {
  void import('@capacitor/keyboard')
    .then(({ Keyboard }) => {
      void Keyboard.addListener('keyboardDidShow', async (info) => {
        await adjustBodyPaddingForKeyboard(info.keyboardHeight);

        for (const cb of virtualKeyboardOpenListeners) {
          safeExec(cb);
        }
      });

      void Keyboard.addListener('keyboardWillHide', () => {
        void adjustBodyPaddingForKeyboard(0);
      });
    });
}

if ('visualViewport' in window && (IS_IOS || IS_ANDROID)) {
  window.visualViewport!.addEventListener('resize', throttle((e: Event) => {
    const target = e.target as VisualViewport;

    // In the TMA application on iOS, the VisualViewport behaves incorrectly,
    // not taking into account the height of the virtual keyboard.
    if (IS_IOS && IS_TELEGRAM_APP) {
      const keyboardHeight = initialHeight - target.height;
      void adjustBodyPaddingForKeyboard(keyboardHeight > SAFE_AREA_TOLERANCE_HEIGHT_PX ? keyboardHeight : 0)
        .finally(() => {
          requestMeasure(() => {
            currentWindowSize = {
              ...getWindowSize(),
              height: target.height,
            };
          });
        });
    } else {
      patchVh();
      currentWindowSize = {
        ...getWindowSize(),
        height: target.height,
      };
    }
  }, WINDOW_RESIZE_THROTTLE_MS, true));
}

export function updateSizes() {
  patchVh();
  patchSafeAreaProperty();

  return getWindowSize();
}

function getWindowSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    screenHeight: window.screen.height,
    safeAreaTop: getSafeAreaTop(),
    safeAreaBottom: getSafeAreaBottom(),
  };
}

export default {
  get: () => currentWindowSize,
  getIsKeyboardVisible: () => initialHeight > currentWindowSize.height,
};

// Registers a callback that will be fired each time the virtual keyboard is opened and the <body> size is adjusted
export function onVirtualKeyboardOpen(cb: NoneToVoidFunction) {
  virtualKeyboardOpenListeners.push(cb);
}

function patchVh() {
  if (!(IS_IOS || IS_ANDROID) || IS_CAPACITOR || (IS_IOS && IS_TELEGRAM_APP)) return;

  const height = IS_IOS ? window.visualViewport!.height + window.visualViewport!.pageTop : window.innerHeight;

  requestMutation(() => {
    const vh = height * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  });
}

function adjustBodyPaddingForKeyboard(keyboardHeight: number) {
  return new Promise<void>((resolve) => {
    requestMutation(() => {
      applyStyles(document.body, { paddingBottom: keyboardHeight ? `${keyboardHeight}px` : '' });
      resolve();
    });
  });
}

function patchSafeAreaProperty() {
  toggleSafeAreaClasses();

  // WebKit has issues with this property on page load
  // https://bugs.webkit.org/show_bug.cgi?id=191872
  setTimeout(() => {
    toggleSafeAreaClasses();
    updateSafeAreaValues();
  }, SAFE_AREA_INITIALIZATION_DELAY);
}

function getSafeAreaTop() {
  const value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top-value'), 10);

  return Number.isNaN(value) ? 0 : value;
}

function getSafeAreaBottom() {
  const value = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom-value'), 10);

  return Number.isNaN(value) ? 0 : value;
}

function toggleSafeAreaClasses() {
  const { safeAreaTop, safeAreaBottom } = getWindowSize();
  const { documentElement } = document;

  requestMutation(() => {
    documentElement.classList.toggle('with-safe-area-top', !Number.isNaN(safeAreaTop) && safeAreaTop > 0);
    documentElement.classList.toggle('with-safe-area-bottom', !Number.isNaN(safeAreaBottom) && safeAreaBottom > 0);
  });
}

function updateSafeAreaValues() {
  const { safeAreaTop, safeAreaBottom } = getWindowSize();

  currentWindowSize = {
    ...currentWindowSize,
    safeAreaTop,
    safeAreaBottom,
  };
}
