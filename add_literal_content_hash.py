#!/usr/bin/env python3
"""Add content_hash for inserts with literal string content."""
import hashlib

# Read the file
with open('/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/tests/test_database_constraints.py', 'r') as f:
    lines = f.readlines()

# Cases to fix with their literal content strings
fixes = [
    {"line_approx": 495, "content": "With relation"},
    {"line_approx": 554, "content": "With relation"},
    {"line_approx": 615, "content": "With entity relation"},
    {"line_approx": 671, "content": "Multiple relations"}
]

new_lines = []
i = 0

while i < len(lines):
    line = lines[i]

    # Check if this line matches one of our problem INSERT statements
    if "'Test Memory'," in line and "'With relation'" in line and "%(content_hash)s" in line:
        # This is line 495 or 554 - content is "With relation"
        content_text = "With relation"
        content_hash = hashlib.sha256(content_text.encode()).hexdigest()

        # Add current line
        new_lines.append(line)

        # Find the parameter dict (should be within next 5 lines)
        j = i + 1
        while j < len(lines) and j < i + 10:
            param_line = lines[j]
            new_lines.append(param_line)

            # If we find the user_id line, add content_hash after it
            if '"user_id":' in param_line and '"content_hash"' not in ''.join(lines[j:j+3]):
                indent = ' ' * (len(param_line) - len(param_line.lstrip()))
                new_lines.append(f'{indent}"content_hash": "{content_hash}",\n')

            j += 1
            if '"updated_at"' in param_line:
                break

        i = j
        continue

    elif "'Test Memory'," in line and "'With entity relation'" in line and "%(content_hash)s" in line:
        # Line 615 - content is "With entity relation"
        content_text = "With entity relation"
        content_hash = hashlib.sha256(content_text.encode()).hexdigest()

        new_lines.append(line)

        j = i + 1
        while j < len(lines) and j < i + 10:
            param_line = lines[j]
            new_lines.append(param_line)

            if '"user_id":' in param_line and '"content_hash"' not in ''.join(lines[j:j+3]):
                indent = ' ' * (len(param_line) - len(param_line.lstrip()))
                new_lines.append(f'{indent}"content_hash": "{content_hash}",\n')

            j += 1
            if '"updated_at"' in param_line:
                break

        i = j
        continue

    elif "'Test Memory'," in line and "'Multiple relations'" in line and "%(content_hash)s" in line:
        # Line 671 - content is "Multiple relations"
        content_text = "Multiple relations"
        content_hash = hashlib.sha256(content_text.encode()).hexdigest()

        new_lines.append(line)

        j = i + 1
        while j < len(lines) and j < i + 10:
            param_line = lines[j]
            new_lines.append(param_line)

            if '"user_id":' in param_line and '"content_hash"' not in ''.join(lines[j:j+3]):
                indent = ' ' * (len(param_line) - len(param_line.lstrip()))
                new_lines.append(f'{indent}"content_hash": "{content_hash}",\n')

            j += 1
            if '"updated_at"' in param_line:
                break

        i = j
        continue

    new_lines.append(line)
    i += 1

# Write back
with open('/Users/wivak/puo-jects/____active/purmemo/v1-mvp/backend/tests/test_database_constraints.py', 'w') as f:
    f.writelines(new_lines)

print("Added content_hash for literal string inserts!")
print("Fixed 4 cases:")
print("  - 'With relation' (2 times)")
print("  - 'With entity relation'")
print("  - 'Multiple relations'")
