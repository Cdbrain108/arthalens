"""Opt-in HTTP smoke test: uses the running server's actual data providers."""
import argparse
import json
import time
import httpx


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--query', default='Research AAPL')
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url, timeout=30) as client:
        client.get('/api/health').raise_for_status()
        response = client.post('/api/research', json={'query': args.query})
        response.raise_for_status()
        job_id = response.json()['job_id']
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            status = client.get(f'/api/research/{job_id}/status').json()
            if status['status'] in ('succeeded', 'failed'):
                break
            time.sleep(1)
        else:
            raise TimeoutError('Research did not reach a terminal status in 600s')
        print(json.dumps({'job_id': job_id, 'query': args.query, 'status': status['status'],
                          'selected': status['selected_agents'], 'agents': status.get('agent_statuses'),
                          'errors': status['errors']}, indent=2))
        if status['status'] != 'succeeded':
            raise RuntimeError('Research pipeline failed')
        report = client.get(f'/api/research/{job_id}/report')
        report.raise_for_status()
        data = report.json()
        pdf = client.get(f'/api/research/{job_id}/pdf')
        pdf.raise_for_status()
        assert pdf.content.startswith(b'%PDF')
        print(json.dumps({'classification': data['overall_assessment']['classification'],
                          'evidence_count': len(data.get('evidence', [])),
                          'source_count': len(data['sources']), 'gap_count': len(data['evidence_gaps']),
                          'pdf_bytes': len(pdf.content)}, indent=2))


if __name__ == '__main__':
    main()
