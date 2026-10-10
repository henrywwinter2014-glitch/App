/*
 * Optional: Google, Apple, Microsoft and email sign-in for your own hosted copy.
 *
 * 1. Create a project at https://console.firebase.google.com and add a Web app.
 * 2. Paste the config object it gives you below (replacing null).
 * 3. In Authentication > Sign-in method, enable Google, Apple, Microsoft and Email/Password.
 * 4. In Authentication > Settings > Authorized domains, add the domain you host the app on.
 * 5. Create a Cloud Firestore database and set the security rules from the README.
 *
 * Leave it as null to keep saves in the browser only (or on the claude.ai link, in your Claude account).
 */
window.FIREBASE_CONFIG = null;
/* Example:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:1234567890:web:abc123",
};
*/
