const fs = require('fs');
const filePath = 'C:\\Users\\TAMIL MANI\\Desktop\\Tamil\\tamilfrontend\\src\\pages\\changeManagement\\changemanagement.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const snippet = `    // Review Policy Removal (Super Admin)
    const handleConfirmPolicyRemovalReview = async () => {
        if (!reviewingPolicyRemoval) return;
        setIsReviewingPolicyRemoval(true);
        try {
            await documentManagementApi.reviewPolicyRemoval(reviewingPolicyRemoval.id, policyRemovalAction, policyRemovalFeedback);
            const docName = reviewingPolicyRemoval.document_name;
            const docId = reviewingPolicyRemoval.id;
            setReviewingPolicyRemoval(null);
            setPolicyRemovalFeedback('');
            setToastMsg(\`Policy "\${docName}" removal \${policyRemovalAction === 'approve' ? 'approved and policy suspended' : 'rejected'}.\`);
            window.dispatchEvent(new CustomEvent('liblist:document-updated', { detail: { document_id: docId } }));
            window.dispatchEvent(new CustomEvent('liblist:refresh-nav'));
            loadPolicies();
        } catch (err) {
            alert(err.message || 'Failed to review policy removal');
        } finally {
            setIsReviewingPolicyRemoval(false);
        }
    };
`;

let cleaned = content.split(snippet).join('');
// Insert it just before '    return ('
const target = '    return (\n        <div className="change-mgmt-container">';
if (cleaned.includes(target)) {
    cleaned = cleaned.replace(target, snippet + '\n' + target);
} else {
    cleaned = cleaned.replace('    return (', snippet + '\n    return (');
}

fs.writeFileSync(filePath, cleaned, 'utf8');
console.log('Successfully cleaned and placed single function.');
