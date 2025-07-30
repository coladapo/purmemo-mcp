
def transformer_attention(query, key, value):
    '''Multi-head attention mechanism'''
    scores = torch.matmul(query, key.transpose(-2, -1))
    weights = torch.softmax(scores, dim=-1)
    return torch.matmul(weights, value)
    