import React from "react";
import { Streamdown } from "streamdown";

interface ChatMarkdownProps {
  content: string;
}

const ChatMarkdown: React.FC<ChatMarkdownProps> = ({ content }) => {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert break-words">
      <Streamdown>{content}</Streamdown>
    </div>
  );
};

export default ChatMarkdown;
