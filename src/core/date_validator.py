"""
Date Validator - Detects potential date discrepancies in memory content
"""
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class DateValidator:
    """Validates dates in memory content to detect discrepancies"""
    
    # Common date patterns
    DATE_PATTERNS = [
        # Month Year (December 2024)
        (r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b', 'month_year'),
        # DD Month YYYY (15 December 2024)
        (r'\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b', 'dd_month_yyyy'),
        # YYYY-MM-DD (2024-12-25)
        (r'\b(\d{4})-(\d{2})-(\d{2})\b', 'iso_date'),
        # MM/DD/YYYY or MM-DD-YYYY (12/25/2024)
        (r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b', 'us_date'),
        # Relative dates
        (r'\b(yesterday|today|tomorrow|last\s+week|next\s+week|last\s+month|next\s+month)\b', 'relative'),
        # Time ago (3 days ago, 2 months ago)
        (r'\b(\d+)\s+(days?|weeks?|months?|years?)\s+ago\b', 'time_ago'),
    ]
    
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12
    }
    
    def __init__(self, warning_threshold_days: int = 30):
        """
        Initialize the date validator
        
        Args:
            warning_threshold_days: Number of days difference to trigger a warning
        """
        self.warning_threshold_days = warning_threshold_days
    
    def validate_content(self, content: str, created_at: Optional[datetime] = None) -> Dict[str, any]:
        """
        Validate dates in content and check for discrepancies
        
        Args:
            content: The memory content to validate
            created_at: When the memory was created (defaults to now)
            
        Returns:
            Dict with validation results including warnings and found dates
        """
        if created_at is None:
            created_at = datetime.now()
        
        results = {
            'has_warnings': False,
            'warnings': [],
            'found_dates': [],
            'relative_dates': [],
            'suggestions': []
        }
        
        # Find all dates in content
        for pattern, pattern_type in self.DATE_PATTERNS:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            
            for match in matches:
                date_info = self._parse_date_match(match, pattern_type)
                if date_info:
                    # Check for discrepancies
                    if date_info.get('parsed_date'):
                        warning = self._check_date_discrepancy(
                            date_info['parsed_date'], 
                            created_at,
                            date_info['original_text']
                        )
                        if warning:
                            results['warnings'].append(warning)
                            results['has_warnings'] = True
                    
                    # Track relative dates
                    if pattern_type == 'relative':
                        results['relative_dates'].append({
                            'text': date_info['original_text'],
                            'position': match.start()
                        })
                    
                    # Convert datetime to string for JSON serialization
                    if date_info.get('parsed_date'):
                        date_info['parsed_date_str'] = date_info['parsed_date'].isoformat()
                        del date_info['parsed_date']
                    
                    results['found_dates'].append(date_info)
        
        # Add suggestions for relative dates
        if results['relative_dates']:
            results['suggestions'].append(
                "Consider using specific dates instead of relative dates like 'yesterday' or 'today' "
                "to avoid confusion when reviewing memories later."
            )
        
        # Check for suspicious old dates in new content
        if self._has_suspicious_old_dates(content, created_at):
            results['warnings'].append({
                'type': 'old_date_in_new_content',
                'message': 'This memory references dates from more than 6 months ago. '
                          'Please verify if this is historical content or if the date needs updating.'
            })
            results['has_warnings'] = True
        
        return results
    
    def _parse_date_match(self, match: re.Match, pattern_type: str) -> Optional[Dict]:
        """Parse a regex match into date information"""
        try:
            date_info = {
                'original_text': match.group(0),
                'type': pattern_type,
                'position': match.start()
            }
            
            if pattern_type == 'month_year':
                month = self.MONTH_MAP.get(match.group(1).lower())
                year = int(match.group(2))
                date_info['parsed_date'] = datetime(year, month, 1)
                
            elif pattern_type == 'dd_month_yyyy':
                day = int(match.group(1))
                month = self.MONTH_MAP.get(match.group(2).lower())
                year = int(match.group(3))
                date_info['parsed_date'] = datetime(year, month, day)
                
            elif pattern_type == 'iso_date':
                year = int(match.group(1))
                month = int(match.group(2))
                day = int(match.group(3))
                date_info['parsed_date'] = datetime(year, month, day)
                
            elif pattern_type == 'us_date':
                month = int(match.group(1))
                day = int(match.group(2))
                year = int(match.group(3))
                date_info['parsed_date'] = datetime(year, month, day)
                
            elif pattern_type == 'time_ago':
                amount = int(match.group(1))
                unit = match.group(2).lower()
                if 'day' in unit:
                    date_info['parsed_date'] = datetime.now() - timedelta(days=amount)
                elif 'week' in unit:
                    date_info['parsed_date'] = datetime.now() - timedelta(weeks=amount)
                elif 'month' in unit:
                    date_info['parsed_date'] = datetime.now() - timedelta(days=amount * 30)
                elif 'year' in unit:
                    date_info['parsed_date'] = datetime.now() - timedelta(days=amount * 365)
            
            return date_info
            
        except Exception as e:
            logger.debug(f"Failed to parse date match: {match.group(0)} - {e}")
            return None
    
    def _check_date_discrepancy(self, found_date: datetime, created_at: datetime, 
                                date_text: str) -> Optional[Dict]:
        """Check if a found date represents a discrepancy"""
        
        # Remove timezone info for comparison
        found_date = found_date.replace(tzinfo=None)
        created_at = created_at.replace(tzinfo=None)
        
        # Calculate difference
        diff_days = abs((created_at - found_date).days)
        
        # Check for future dates
        if found_date > created_at + timedelta(days=7):
            return {
                'type': 'future_date',
                'message': f"Found future date '{date_text}' in content created on {created_at.strftime('%Y-%m-%d')}",
                'severity': 'high'
            }
        
        # Check for old dates in recent content
        if diff_days > self.warning_threshold_days and created_at.year == datetime.now().year:
            months_diff = diff_days // 30
            return {
                'type': 'old_date',
                'message': f"Date '{date_text}' is approximately {months_diff} months before the memory was created",
                'severity': 'medium' if months_diff < 6 else 'high'
            }
        
        return None
    
    def _has_suspicious_old_dates(self, content: str, created_at: datetime) -> bool:
        """Check if content has suspiciously old dates"""
        current_year = datetime.now().year
        created_year = created_at.year
        
        # If created recently but references old years
        if created_year == current_year:
            for year in range(current_year - 5, current_year):
                if str(year) in content:
                    return True
        
        return False
    
    def suggest_date_corrections(self, content: str) -> List[Tuple[str, str]]:
        """Suggest corrections for relative dates"""
        suggestions = []
        today = datetime.now()
        
        replacements = {
            'yesterday': (today - timedelta(days=1)).strftime('%B %d, %Y'),
            'today': today.strftime('%B %d, %Y'),
            'tomorrow': (today + timedelta(days=1)).strftime('%B %d, %Y'),
            'last week': (today - timedelta(weeks=1)).strftime('the week of %B %d, %Y'),
            'next week': (today + timedelta(weeks=1)).strftime('the week of %B %d, %Y'),
        }
        
        for relative, specific in replacements.items():
            if relative in content.lower():
                suggestions.append((relative, specific))
        
        return suggestions