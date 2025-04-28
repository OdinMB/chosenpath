import "mocha";
import "chai";

declare module "chai" {
  export const expect: any;
}

declare function describe(name: string, fn: (this: Mocha.Suite) => void): void;
declare function it(
  name: string,
  fn?: (this: Mocha.Context) => Promise<void> | void
): void;

interface Mocha {
  Suite: any;
  Context: any;
}
