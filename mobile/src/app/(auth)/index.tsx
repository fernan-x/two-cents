import { Redirect } from 'expo-router';

/** The signed-out group's entry point: the router lands here when the session ends (Stack.Protected). */
export default function AuthIndex() {
  return <Redirect href="/welcome" />;
}
