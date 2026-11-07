function outer(x: number) {
  if (x > 0) {
    const inner = (y: number) => {
      if (y > 10) {
        return y * 2;
      }
      return y;
    };
    return inner(x);
  }
  return 0;
}
