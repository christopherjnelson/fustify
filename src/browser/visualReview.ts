export function isVisualReview(): boolean {
  return (
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('visual-review') === '1'
  );
}
