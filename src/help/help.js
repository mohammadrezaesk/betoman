document.querySelectorAll(".shot-frame img").forEach((img) => {
  const markLoaded = () => img.closest(".shot-frame")?.classList.add("loaded");
  if (img.complete && img.naturalWidth > 0) {
    markLoaded();
  } else {
    img.addEventListener("load", markLoaded);
  }
});
