"""
Chat Parser for importing conversations from various AI assistants
Supports Claude, ChatGPT, and generic formats
"""
import json
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from html.parser import HTMLParser
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class Message:
    """Represents a single message in a conversation"""
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: Optional[datetime] = None
    attachments: List[str] = None
    has_code: bool = False
    has_action_items: bool = False
    is_edited: bool = False
    message_index: int = 0
    metadata: Dict[str, Any] = None


@dataclass
class Conversation:
    """Represents a complete conversation"""
    id: str
    title: Optional[str]
    source_platform: str
    messages: List[Message]
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    model_version: Optional[str] = None
    total_tokens: Optional[int] = None
    metadata: Dict[str, Any] = None


class ChatGPTHTMLParser(HTMLParser):
    """Parser for ChatGPT HTML exports"""
    
    def __init__(self):
        super().__init__()
        self.conversations = []
        self.current_conversation = None
        self.current_message = None
        self.current_text = []
        self.in_message = False
        self.in_code_block = False
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == 'div' and 'data-message-author-role' in attrs_dict:
            # Start of a new message
            self.in_message = True
            role = attrs_dict['data-message-author-role']
            self.current_message = {
                'role': 'assistant' if role == 'assistant' else 'user',
                'content': '',
                'has_code': False
            }
            
        elif tag == 'code':
            self.in_code_block = True
            if self.current_message:
                self.current_message['has_code'] = True
                
    def handle_data(self, data):
        if self.in_message:
            self.current_text.append(data)
            
    def handle_endtag(self, tag):
        if tag == 'div' and self.in_message and self.current_message:
            # End of message
            self.current_message['content'] = ''.join(self.current_text).strip()
            if self.current_conversation is None:
                self.current_conversation = {'messages': []}
            self.current_conversation['messages'].append(self.current_message)
            
            self.current_message = None
            self.current_text = []
            self.in_message = False
            
        elif tag == 'code':
            self.in_code_block = False


class ChatParser:
    """Universal chat parser for multiple formats"""
    
    @staticmethod
    def detect_format(file_path: Path) -> str:
        """Detect the format of the chat export"""
        content = file_path.read_text(encoding='utf-8', errors='ignore')[:1000]
        
        if file_path.suffix.lower() == '.json':
            try:
                data = json.loads(file_path.read_text())
                if 'conversations' in data and isinstance(data['conversations'], list):
                    return 'claude_json'
                elif 'messages' in data and isinstance(data['messages'], list):
                    return 'generic_json'
            except:
                pass
                
        elif file_path.suffix.lower() in ['.html', '.htm']:
            if 'data-message-author-role' in content:
                return 'chatgpt_html'
                
        elif file_path.suffix.lower() == '.md':
            if re.search(r'^(Human|Assistant|User|AI):', content, re.MULTILINE):
                return 'claude_markdown'
                
        return 'unknown'
    
    @staticmethod
    def parse_claude_json(file_path: Path) -> List[Conversation]:
        """Parse Claude JSON export format"""
        data = json.loads(file_path.read_text())
        conversations = []
        
        for conv_data in data.get('conversations', []):
            messages = []
            for idx, msg in enumerate(conv_data.get('messages', [])):
                message = Message(
                    role=msg.get('role', 'user'),
                    content=msg.get('content', ''),
                    timestamp=datetime.fromisoformat(msg['timestamp']) if 'timestamp' in msg else None,
                    has_code=bool(re.search(r'```[\w]*\n', msg.get('content', ''))),
                    message_index=idx,
                    metadata=msg.get('metadata', {})
                )
                
                # Check for action items
                message.has_action_items = ChatParser._has_action_items(message.content)
                
                messages.append(message)
            
            conversation = Conversation(
                id=conv_data.get('id', f"claude_{datetime.now().timestamp()}"),
                title=conv_data.get('title'),
                source_platform='claude',
                messages=messages,
                started_at=messages[0].timestamp if messages else None,
                ended_at=messages[-1].timestamp if messages else None,
                model_version=conv_data.get('model'),
                metadata=conv_data.get('metadata', {})
            )
            conversations.append(conversation)
            
        return conversations
    
    @staticmethod
    def parse_chatgpt_html(file_path: Path) -> List[Conversation]:
        """Parse ChatGPT HTML export"""
        html_content = file_path.read_text(encoding='utf-8')
        parser = ChatGPTHTMLParser()
        parser.feed(html_content)
        
        # Convert parsed data to Conversation objects
        conversations = []
        
        if parser.current_conversation:
            messages = []
            for idx, msg_data in enumerate(parser.current_conversation['messages']):
                message = Message(
                    role=msg_data['role'],
                    content=msg_data['content'],
                    has_code=msg_data.get('has_code', False),
                    message_index=idx
                )
                message.has_action_items = ChatParser._has_action_items(message.content)
                messages.append(message)
            
            conversation = Conversation(
                id=f"chatgpt_{datetime.now().timestamp()}",
                title=f"ChatGPT Export {datetime.now().strftime('%Y-%m-%d')}",
                source_platform='chatgpt',
                messages=messages,
                started_at=datetime.now(),  # HTML doesn't include timestamps
                metadata={'source_file': str(file_path)}
            )
            conversations.append(conversation)
            
        return conversations
    
    @staticmethod
    def parse_claude_markdown(file_path: Path) -> List[Conversation]:
        """Parse Claude markdown format"""
        content = file_path.read_text()
        messages = []
        current_role = None
        current_content = []
        
        for line in content.split('\n'):
            role_match = re.match(r'^(Human|User|Assistant|AI):\s*(.*)', line)
            if role_match:
                # Save previous message if exists
                if current_role and current_content:
                    message = Message(
                        role='user' if current_role in ['Human', 'User'] else 'assistant',
                        content='\n'.join(current_content).strip(),
                        message_index=len(messages)
                    )
                    message.has_action_items = ChatParser._has_action_items(message.content)
                    message.has_code = bool(re.search(r'```[\w]*\n', message.content))
                    messages.append(message)
                
                # Start new message
                current_role = role_match.group(1)
                current_content = [role_match.group(2)] if role_match.group(2) else []
            else:
                current_content.append(line)
        
        # Don't forget the last message
        if current_role and current_content:
            message = Message(
                role='user' if current_role in ['Human', 'User'] else 'assistant',
                content='\n'.join(current_content).strip(),
                message_index=len(messages)
            )
            message.has_action_items = ChatParser._has_action_items(message.content)
            message.has_code = bool(re.search(r'```[\w]*\n', message.content))
            messages.append(message)
        
        conversation = Conversation(
            id=f"claude_md_{datetime.now().timestamp()}",
            title=file_path.stem,
            source_platform='claude',
            messages=messages,
            metadata={'source_file': str(file_path)}
        )
        
        return [conversation]
    
    @staticmethod
    def parse_generic_json(file_path: Path) -> List[Conversation]:
        """Parse generic JSON format with messages array"""
        data = json.loads(file_path.read_text())
        messages = []
        
        for idx, msg in enumerate(data.get('messages', [])):
            message = Message(
                role=msg.get('role', 'user'),
                content=msg.get('content', ''),
                timestamp=datetime.fromisoformat(msg['timestamp']) if 'timestamp' in msg else None,
                message_index=idx,
                metadata=msg.get('metadata', {})
            )
            message.has_action_items = ChatParser._has_action_items(message.content)
            message.has_code = bool(re.search(r'```[\w]*\n', message.content))
            messages.append(message)
        
        conversation = Conversation(
            id=data.get('id', f"generic_{datetime.now().timestamp()}"),
            title=data.get('title', file_path.stem),
            source_platform=data.get('platform', 'unknown'),
            messages=messages,
            metadata=data.get('metadata', {})
        )
        
        return [conversation]
    
    @staticmethod
    def _has_action_items(content: str) -> bool:
        """Check if content contains action items"""
        action_patterns = [
            r'(?i)TODO:',
            r'(?i)ACTION:',
            r'(?i)TASK:',
            r'(?i)FOLLOWUP:',
            r'(?i)FOLLOW-UP:',
            r'- \[ \]',  # Unchecked checkbox
            r'(?i)^(?:[-*•])\s*(?:TODO|ACTION|TASK)',
        ]
        
        for pattern in action_patterns:
            if re.search(pattern, content, re.MULTILINE):
                return True
        return False
    
    @staticmethod
    def extract_code_blocks(content: str) -> List[Dict[str, str]]:
        """Extract code blocks from content"""
        code_blocks = []
        pattern = r'```(\w*)\n(.*?)\n```'
        
        for match in re.finditer(pattern, content, re.DOTALL):
            language = match.group(1) or 'text'
            code = match.group(2)
            code_blocks.append({
                'language': language,
                'code': code
            })
            
        return code_blocks
    
    @staticmethod
    def extract_references(content: str) -> List[Dict[str, str]]:
        """Extract external references from content"""
        references = []
        
        # GitHub references
        github_pattern = r'(?:https?://)?github\.com/([\w-]+)/([\w-]+)(?:/(?:issues|pull|blob|tree)/([\w-/]+))?'
        for match in re.finditer(github_pattern, content):
            references.append({
                'type': 'github',
                'value': match.group(0),
                'context': f"{match.group(1)}/{match.group(2)}"
            })
        
        # Generic URLs
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        for match in re.finditer(url_pattern, content):
            url = match.group(0)
            if 'github.com' not in url:  # Skip GitHub URLs already captured
                references.append({
                    'type': 'url',
                    'value': url,
                    'context': None
                })
        
        # Slack user mentions
        slack_pattern = r'<@(U[A-Z0-9]+)>'
        for match in re.finditer(slack_pattern, content):
            references.append({
                'type': 'slack_user',
                'value': match.group(1),
                'context': match.group(0)
            })
        
        return references
    
    @staticmethod
    def extract_action_items(content: str) -> List[str]:
        """Extract action items from content"""
        action_items = []
        
        # Pattern matching for various action item formats
        patterns = [
            r'(?i)TODO:\s*(.+?)(?:\n|$)',
            r'(?i)ACTION:\s*(.+?)(?:\n|$)',
            r'(?i)TASK:\s*(.+?)(?:\n|$)',
            r'- \[ \]\s*(.+?)(?:\n|$)',
            r'(?i)FOLLOWUP:\s*(.+?)(?:\n|$)',
        ]
        
        for pattern in patterns:
            for match in re.finditer(pattern, content, re.MULTILINE):
                action_item = match.group(1).strip()
                if action_item:
                    action_items.append(action_item)
        
        return action_items
    
    @staticmethod
    def parse_file(file_path: Path) -> List[Conversation]:
        """Parse a chat export file and return conversations"""
        format_type = ChatParser.detect_format(file_path)
        
        if format_type == 'claude_json':
            return ChatParser.parse_claude_json(file_path)
        elif format_type == 'chatgpt_html':
            return ChatParser.parse_chatgpt_html(file_path)
        elif format_type == 'claude_markdown':
            return ChatParser.parse_claude_markdown(file_path)
        elif format_type == 'generic_json':
            return ChatParser.parse_generic_json(file_path)
        else:
            raise ValueError(f"Unknown chat format: {format_type}")
    
    @staticmethod
    def extract_project_references(content: str) -> List[str]:
        """Extract project references from content"""
        projects = []
        
        # Look for common project indicators
        patterns = [
            r'(?i)project[:\s]+([^,\n.]+)',
            r'(?i)working on[:\s]+([^,\n.]+)',
            r'(?i)for[:\s]+([^,\n.]+)project',
            r'#(\w+project)',
        ]
        
        for pattern in patterns:
            for match in re.finditer(pattern, content):
                project = match.group(1).strip()
                if project and len(project) > 2:
                    projects.append(project)
        
        return list(set(projects))  # Remove duplicates