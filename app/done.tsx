import { Redirect } from 'expo-router';

// Старые ссылки ведут на главную без повторного подтверждения сохранения.
export default function Done() {
  return <Redirect href="/" />;
}
