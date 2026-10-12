import styles from './style.module.css';

// The editor and renderer expose .editor_mention descendants through className.
// Keep their border override without changing the editor's separate outer node
// frame or the plugin's selection, serialization, and keyboard behavior.
export const mentionFilledClassName = styles.mentionFilled;
