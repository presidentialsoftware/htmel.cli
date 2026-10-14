function showNativeToast() {
  if (window.Android) {
    window.Android.showToast("Hello from WebView!");
  } else if (window.webkit && window.webkit.messageHandlers.iOS) {
    window.webkit.messageHandlers.iOS.postMessage("Hello from WebView!");
  } else {
    alert("Native bridge not available");
  }
}
