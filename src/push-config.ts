// Web push (VAPID) public key. The matching private key is the
// VAPID_PRIVATE_KEY repository secret used by the hourly Ember job.
// To rotate: run `npx web-push generate-vapid-keys` in server/, put the new
// public key here and the new private key in the secret; players re-enable
// reminders once.
export const VAPID_PUBLIC_KEY = 'BERfT2QIBxU-mU8gI0MQELnTccton4J1cOFzsRp-0QTj8fe0uXdJHxvNHR9XVOro_sZl7uVjolouRJ6tEyanECA';
