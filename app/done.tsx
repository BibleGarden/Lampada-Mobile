import { Redirect } from 'expo-router';

// Legacy links go straight Home without re-confirming the save.
export default function Done() {
  return <Redirect href="/" />;
}
