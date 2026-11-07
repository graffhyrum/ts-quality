function simple() {
  return 1;
}

function withIf(x: number) {
  if (x > 0) {
    return x;
  }
  return -x;
}

function withLoop(arr: number[]) {
  for (const item of arr) {
    if (item > 0) {
      console.log(item);
    }
  }
}

function withLogical(a: boolean, b: boolean) {
  return a && b || !a;
}

function withTernary(x: number) {
  return x > 0 ? x : -x;
}

function withSwitch(x: string) {
  switch (x) {
    case "a":
      return 1;
    case "b":
      return 2;
    case "c":
      return 3;
    default:
      return 0;
  }
}

function withCatch() {
  try {
    JSON.parse("bad");
  } catch (e) {
    console.error(e);
  }
}

const arrowFn = (x: number) => x + 1;

const arrowWithIf = (x: number) => {
  if (x > 0) return x;
  return -x;
};
