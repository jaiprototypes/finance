-- Rename the broad parent in place so hotel and public transport details keep their IDs.
UPDATE category
SET name = 'Travel & Transport'
WHERE name = 'Transport';
