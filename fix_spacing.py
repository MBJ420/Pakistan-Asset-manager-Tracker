import re

file_path = 'frontend/src/pages/Dashboard.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'import(?=[A-Za-z{])', 'import ', text)
text = re.sub(r'(?<=})from(?=[\'\"a-zA-Z])', ' from ', text)
text = re.sub(r'(?<=[a-zA-Z])from(?=[\'\"a-zA-Z])', ' from ', text)
text = re.sub(r'const(?=[a-zA-Z\[])', 'const ', text)
text = re.sub(r'let(?=[a-zA-Z\[])', 'let ', text)
text = re.sub(r'return(?=[a-zA-Z\(])', 'return ', text)
text = re.sub(r'await(?=Promise)', 'await ', text)
text = re.sub(r'asany', 'as any', text)
text = re.sub(r'exportdefault(?=[A-Za-z])', 'export default ', text)
text = re.sub(r'exportdefault', 'export default ', text)
text = re.sub(r'newPromise', 'new Promise', text)
text = re.sub(r'newError', 'new Error', text)
text = re.sub(r'newBlob', 'new Blob', text)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Syntax spacing restored via script file!')
