/**
 * The details the site lists, in order: shared by its section, the store
 * pictures and the store video, which each draw their own picture for them.
 */
export const features = [
  {
    id: 'chats',
    title: 'More than one chat',
    text: 'Send to yourself, a group or a channel. With several chats, the menu asks which one.',
  },
  {
    id: 'hashtags',
    title: 'Hashtags as you type',
    text: 'Type # in the note to pick a saved tag, so messages are easy to find in Telegram later.',
  },
  {
    id: 'shortcut',
    title: 'One shortcut for the page',
    text: 'Sends the page you’re on without opening anything. Another one opens the popup.',
  },
  {
    id: 'history',
    title: 'History you control',
    text: 'Search what you sent and send it again, or keep only the times, or nothing. Private windows never leave a trace.',
  },
  {
    id: 'lock',
    title: 'An optional password lock',
    text: 'Encrypts your chats, tokens and history in the browser, and asks for the password when the browser starts.',
  },
  {
    id: 'looks',
    title: 'Your chat, your look',
    text: 'Light and dark, six backgrounds, or a photo of your own.',
  },
] as const;

export type Feature = (typeof features)[number];

export type FeatureId = Feature['id'];
