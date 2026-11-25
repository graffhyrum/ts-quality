const key = "computedName";

export class Box {
  public stringField: number = 1;
  public "quotedField": number = 2;
  public [key]: number = 3;
}
