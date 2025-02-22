import factory from './factory';

export interface RadioGroupProps {
  onChange?: (e: any) => void;
}

const RadioGroup = factory<RadioGroupProps>('radio-group');

export default RadioGroup;
